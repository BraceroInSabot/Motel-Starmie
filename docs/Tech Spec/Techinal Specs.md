# Technical Specs — V1

> **Scope:** technical conventions for V1 (Python, Django, Poetry, PostgreSQL, Docker, pytest, JavaScript, React, TypeScript, MantineUI, plus Stripe, Django Channels with RabbitMQ, cron and WeasyPrint, as listed in `docs/Tech Stack/Tools.md`).
> **Business rules are not defined here.** They come only from the user stories (`docs/Initial Requirements/US-01` to `US-23`). If this document and a user story disagree, the user story wins.
> **Status:** approved conventions. The project owner's decisions of 2026-11-03 are recorded in section 7. Items still open are marked **[CONFIRM]**.

This document closes the five V1 gaps:

1. API conventions
2. Project setup
3. External services
4. Front-end i18n
5. Code quality and Definition of Done

---

## 1. API conventions

### 1.1 General rules

| Topic | Convention |
|---|---|
| Base path | `/api/v1/...`. A breaking change creates `/api/v2/`; additive changes stay in v1. |
| Framework | Django REST Framework (DRF) on top of Django, for serializers, permissions, pagination and throttling. |
| Resource names | Plural nouns in kebab-case: `/room-types`, `/reservations`, `/folio-entries`. |
| Nesting | Only one level, and only when the child cannot exist without the parent: `/properties/{id}/rooms`. |
| Actions | Domain actions that are not plain CRUD are sub-resources with `POST`: `/reservations/{id}/confirm`, `/reservations/{id}/check-in`, `/rooms/{id}/verification`. |
| JSON keys | `snake_case`. |
| IDs | UUID v4 strings. Confirmation codes and invoice numbers are separate, human-readable fields. |
| Enums | `UPPER_SNAKE_CASE` strings, the same values as the domain (`IN_HOUSE`, `MAINTENANCE`, `STRIPE_CARD`). |
| Nulls | Optional fields are always present, with `null` when empty (no missing keys). |
| Content type | `application/json; charset=utf-8`. Errors use `application/problem+json`. Exports use `application/pdf` or `text/csv; charset=utf-8`. |
| Delete | No `DELETE` for business records (rooms, room types, fine types, ledger entries). Deactivation is `PATCH {"is_active": false}`. |

### 1.2 HTTP status codes

| Code | When |
|---|---|
| `200 OK` | Read, update or action completed. |
| `201 Created` | Resource created. Response body contains the resource and a `Location` header. |
| `204 No Content` | Action completed with nothing to return (e.g., logout). |
| `400 Bad Request` | Malformed request (invalid JSON, unknown query parameter type). |
| `401 Unauthorized` | No valid session, or the session expired (US-01). |
| `402 Payment Required` | Stripe declined a charge or a hold (US-06, US-09, US-13). |
| `403 Forbidden` | Authenticated but not allowed by the permission matrix or the property scope (US-01). |
| `404 Not Found` | Resource does not exist **or** is outside the user's property scope (never reveal other properties' data). |
| `409 Conflict` | Business-state conflict: invalid transition, room no longer available, optimistic-lock version mismatch, duplicate room number, outstanding balance at check-out. |
| `422 Unprocessable Entity` | Validation failed (field rules, stay longer than 5 nights, missing justification). |
| `423 Locked` | Staff account locked after 10 failed attempts (US-01). |
| `429 Too Many Requests` | Throttling on public endpoints. |
| `500` / `502` / `503` | Unexpected error / Stripe or email unreachable / maintenance. |

### 1.3 Error response format

All errors follow RFC 9457 (Problem Details) with two extra members, `code` and `errors`:

```json
{
  "type": "https://starmie.local/problems/room-no-longer-available",
  "title": "Room no longer available",
  "status": 409,
  "detail": "The last Double Queen room for 2026-11-14 was just booked.",
  "code": "ROOM_NO_LONGER_AVAILABLE",
  "errors": [],
  "trace_id": "6f1c2a9e4b7d4e0f"
}
```

Validation error example:

```json
{
  "type": "https://starmie.local/problems/validation-error",
  "title": "Validation failed",
  "status": 422,
  "detail": "One or more fields are invalid.",
  "code": "VALIDATION_ERROR",
  "errors": [
    { "field": "check_out", "code": "MAX_STAY_EXCEEDED", "message": "The maximum stay is 5 nights." },
    { "field": "guest.email", "code": "REQUIRED", "message": "This field is required." }
  ],
  "trace_id": "6f1c2a9e4b7d4e0f"
}
```

Rules:

* `code` is stable and machine-readable; the front end translates it (EN/FR) and never shows `detail` to guests as-is.
* `message` and `detail` are in English for logs and developers. The language a guest sees comes from the front-end translation of `code`.
* Domain exceptions (e.g., `RoomNoLongerAvailable`, `InvalidTransition`, `OutstandingBalance`) are mapped to problems in one place, a DRF exception handler in the interface layer. The domain never imports HTTP.
* `trace_id` is also written to the application log, so a support request can be matched to the error.
* The login endpoint always returns the same problem for an unknown email and a wrong password (US-01, Scenario 2).
* Errors never contain PII, card data or stack traces.

### 1.4 Pagination

Page-number pagination on every list endpoint:

```
GET /api/v1/guests?page=2&page_size=25
```

```json
{
  "count": 137,
  "page": 2,
  "page_size": 25,
  "next": "/api/v1/guests?page=3&page_size=25",
  "previous": "/api/v1/guests?page=1&page_size=25",
  "results": [ ... ]
}
```

* Default `page_size` 25, maximum 100.
* Exceptions that return the whole set: the front desk dashboard (US-10) and the housekeeping board (US-18), which are bounded by one property and one day; and report exports (PDF and CSV), which contain every row.
* Report screens (US-22, US-23) paginate the detail table; totals are always computed on the full period, not the page.

### 1.5 Filtering, search and ordering

| Need | Convention | Example |
|---|---|---|
| Exact filter | Field name | `?status=IN_HOUSE&channel=OTA` |
| Several values | Comma-separated | `?status=CONFIRMED,UNCONFIRMED` |
| Date range | `_from` / `_to` suffixes, inclusive | `?check_in_from=2026-11-01&check_in_to=2026-11-30` |
| Free-text search | `q` | `?q=smith` (name, confirmation code or room number, US-10) |
| Ordering | `ordering`, `-` for descending | `?ordering=-check_in_date,room_number` |

* Every list endpoint documents its allowed filters and ordering fields; unknown parameters return `400`.
* Property scope is enforced on the server: a Front Desk Agent or Housekeeper always gets their own property, whatever the URL says (US-01).
* Search over encrypted guest fields (US-20) uses the email hash for exact email matches; name search is done on the decrypted values of the property's current and upcoming reservations only, to stay inside the 1.5 s rule (US-10).

### 1.6 Dates, times and money in JSON

| Kind | Format | Example |
|---|---|---|
| Instant (timestamp) | ISO 8601 in UTC with `Z` | `"2026-11-02T05:00:12Z"` |
| Business / stay date (property local) | ISO 8601 date | `"2026-11-14"` |
| Local time of day | `HH:MM`, 24-hour | `"16:00"` |
| Timezone | IANA name | `"America/Halifax"` |
| Money | Object with a **string** decimal and an ISO 4217 code | `{"amount": "117.42", "currency": "CAD"}` |
| Rate (tax) | String decimal, 4 places | `"0.1400"` |
| Percentage (reports) | String decimal, 1 place | `"50.0"` |

* Money amounts are never JSON numbers, so no client can turn them into floats. The backend parses them with `Decimal` (US-04, US-15).
* Stay dates (check-in, check-out, nights, business dates) are property-local dates without a time or zone, because a night belongs to the property's calendar (US-03, US-14).
* The API returns timestamps in UTC; the front end converts them to the property's timezone for display (`Intl.DateTimeFormat` with the property's `timezone`).
* `"N/A"` values in reports (US-23) are returned as `null`; the front end and exports show "N/A".

### 1.7 Idempotency and concurrency

* **`Idempotency-Key` header** (UUID generated by the client) is required on every `POST` that can move money: create reservation (US-06), desk booking (US-09), deposit (US-13), check-out and desk payment (US-17), late fine (US-16), refund correction (US-15), "Release now" and "Retry refund" (US-22). The server stores the key with the response for 24 hours and replays it on a repeated request. The same key is passed to Stripe.
* **OTA webhook** idempotency uses the OTA Booking ID (US-07), not the header.
* **Optimistic locking** on updates: resources with a `version` field (rooms, reservations) require it in `PATCH` and action bodies; a mismatch returns `409` with code `VERSION_CONFLICT`.

### 1.8 Authentication

**Decision: server-side session with an HttpOnly cookie, not tokens (JWT).**

Reasons:

* US-01 needs features that are simple with sessions and complex with stateless tokens: a fixed 12-hour session, immediate logout of deactivated staff, account lockout, and "must change password" before any other screen.
* The front end and the API are served from the same origin, so a cookie works without CORS.
* An HttpOnly cookie cannot be read by JavaScript, which protects the session against XSS token theft.
* Django Channels reuses the same session for WebSockets (US-12, US-18).

Rules:

| Item | Value |
|---|---|
| Session backend | Django database sessions (`django.contrib.sessions`, PostgreSQL) |
| Session lifetime | 12 hours from login, not extended by activity (`SESSION_COOKIE_AGE = 43200`, `SESSION_SAVE_EVERY_REQUEST = False`, plus an absolute `expires_at` check in `AuthorizeRequest`, US-01) |
| Cookie flags | `HttpOnly`, `Secure` (prod), `SameSite=Lax` |
| CSRF | Django CSRF protection on all unsafe methods; the SPA reads the `csrftoken` cookie and sends it in the `X-CSRFToken` header |
| Login / logout | `POST /api/v1/auth/login`, `POST /api/v1/auth/logout`; current user: `GET /api/v1/auth/me` (role, property, permissions, `must_change_password`) |
| Password hashing | Argon2 (`argon2-cffi`) as Django's first password hasher |
| Common/leaked passwords | Django `CommonPasswordValidator` plus a minimum length of 12 (US-01). Leaked-password check: **[CONFIRM]** source (section 7) |
| Password reset (US-01) | `POST /api/v1/auth/password-reset` (always `202`, same message) and `/confirm`; token stored as a hash, single use, expires after 1 hour |
| WebSockets | `AuthMiddlewareStack` reads the same session cookie; the consumer checks the permission and the property scope before joining a group |
| Guests | No login. Public endpoints (availability, terms, booking, cancellation link) are anonymous, CSRF-protected and throttled (e.g., 60 requests/minute per IP) |
| Webhooks | CSRF-exempt, authenticated only by signature: HMAC for the OTA mock (US-07), Stripe signature for Stripe (section 3.2) |

### 1.9 API documentation

* The OpenAPI 3 schema is generated from the code with `drf-spectacular` and served at `/api/v1/schema/` with a Swagger UI at `/api/v1/docs/` in development only.
* Every endpoint declares its request, response, error codes and permission.

---

## 2. Project setup

### 2.1 Repository layout

```
motel-starmie/
├── CLAUDE.md
├── README.md                      # how to run, test and contribute
├── CHANGELOG.md
├── docker-compose.yml
├── .env.example                   # every variable, no real secrets
├── docs/
│   ├── Business Modeling/
│   ├── Tech Stack/
│   ├── Tech Spec/                 # this document
│   ├── Initial Requirements/      # user stories + Diagrams
│   ├── Wiki/                      # one page per module (see 5.5)
│   └── ADR/                       # architecture decision records
├── backend/
│   ├── pyproject.toml             # Poetry: dependencies, ruff, mypy, pytest
│   ├── poetry.lock
│   ├── manage.py
│   ├── Dockerfile
│   ├── config/
│   │   ├── settings/              # base.py, dev.py, test.py, prod.py
│   │   ├── urls.py
│   │   ├── asgi.py                # Django + Channels routing
│   │   └── crontab                # scheduled jobs (section 2.3)
│   ├── locale/                    # en/ and fr/ .po files for emails and PDFs
│   ├── templates/                 # email and PDF HTML templates (shared by invoice and reports)
│   └── starmie/
│       ├── shared/                # Money, Clock, domain events, UnitOfWork, audit log, problem handler
│       ├── identity/              # US-01 staff, sessions, permission matrix
│       ├── properties/            # US-02 properties, room types, rooms, rates (US-03)
│       ├── taxes/                 # US-04 tax rates and engine
│       ├── terms/                 # US-05 terms versions and acceptances
│       ├── guests/                # US-20 profiles, US-21 Forget Me
│       ├── reservations/          # US-03 search, US-06, US-09, US-11, inventory
│       ├── ota/                   # US-07 webhook and simulator, US-08 mapping
│       ├── payments/              # Stripe adapter, refunds, Stripe webhook
│       ├── folio/                 # US-15 ledger
│       ├── front_desk/            # US-10 dashboard, US-12, US-13 check-in, US-17 check-out, invoices
│       ├── night_audit/           # US-14
│       ├── housekeeping/          # US-18 board, US-19 room state machine
│       ├── violations/            # US-16 fine types, reports, evidence
│       ├── notifications/         # email outbox and templates
│       └── reporting/             # US-22, US-23
└── frontend/
    ├── package.json
    ├── vite.config.ts
    ├── tsconfig.json
    ├── Dockerfile
    └── src/
        ├── app/                   # router, providers (Mantine, i18n, query client), layout
        ├── shared/                # API client, problem → message mapping, money/date formatting, hooks
        ├── i18n/                  # setup + locales (section 4)
        └── features/
            ├── booking/           # public widget: search, terms, payment, cancellation link
            ├── auth/
            ├── front-desk/        # dashboard, walk-in, check-in, check-out, folio
            ├── housekeeping/      # board, violation reports
            ├── guests/
            ├── reports/
            ├── settings/          # properties, rooms, rates, taxes, terms, deposit, fees, fines, OTA mapping, staff, permissions
            └── dev-ota-simulator/ # development only (US-07)
```

### 2.2 Inside each Django app (Clean Architecture)

```
starmie/<module>/
├── domain/            # entities, value objects, domain services, repository ports — pure Python, no Django import
├── application/       # use cases, DTOs, application ports (PaymentGateway, Notifier, Clock…)
├── infrastructure/    # Django models, repositories, adapters (Stripe, email, storage), management commands
├── interface/         # DRF views, serializers, URL routes, WebSocket consumers
├── migrations/
└── tests/
    ├── unit/          # domain and application, with fakes — no database
    └── integration/   # repositories, endpoints, webhooks, consumers — with database
```

Rules:

* `domain` imports nothing from Django, DRF, Stripe or other modules' `infrastructure`.
* Modules talk to each other through application services or domain events, never by importing another module's models.
* An import-linter contract (`import-linter`) checks these rules (section 5.1).

### 2.3 docker-compose services

| Service | Image / build | Purpose | Ports (dev) |
|---|---|---|---|
| `db` | `postgres:16` | Main database | 5432 |
| `rabbitmq` | `rabbitmq:3-management` | Channel layer for Django Channels | 5672, 15672 (UI) |
| `backend` | `./backend` | Django ASGI app (Daphne): REST API, WebSockets, admin | 8000 |
| `scheduler` | `./backend` (same image) | `cron` running `config/crontab` | — |
| `frontend` | `./frontend` | Vite dev server in dev; static build served by `nginx` in prod | 5173 |
| `nginx` | `nginx:stable` | One origin: `/` → frontend, `/api` and `/ws` → backend, `/media/public` → room photos | 80 |
| `mailpit` | `axllent/mailpit` | **Dev only.** Catches all emails; web UI to read them | 1025 (SMTP), 8025 (UI) |
| `stripe-cli` | `stripe/stripe-cli` | **Dev only.** Forwards Stripe test webhooks to the backend | — |

Volumes: `pgdata` (database), `media` (photos, evidence, invoices — section 3.3), `rabbitmq-data`.

Scheduled jobs (`config/crontab`, all as Django management commands):

| Schedule | Command | Story |
|---|---|---|
| Every minute | `run_night_audit_tick` — for each property, runs the audit when the local time has passed 2:00 AM and no run exists for the business date; handles DST and the 15-minute retries | US-14 |
| Every 15 minutes | `mark_no_shows` | US-11 |
| Every 5 minutes | `retry_hold_releases` | US-17 |
| Every minute | `send_outbox_emails` | section 3.1 |
| Daily, 3:30 AM local | `clearsessions` (expired sessions) and idempotency-key cleanup | US-01, 1.7 |

The cron daemon runs in UTC; property-local times are computed inside the commands with `zoneinfo`, so DST never depends on the server clock.

> **RabbitMQ in V1** is used only as the Django Channels layer (`channels-rabbitmq`). Background work (emails, retries) runs from cron through database tables (outbox pattern), so no extra task framework is added in V1. Message queues for background work arrive in V2 with the full RabbitMQ use listed in `Tools.md`.

### 2.4 Environment variables

All configuration comes from environment variables (12-factor). `.env.example` lists every variable; real values never enter the repository.

| Variable | Example / default | Used by |
|---|---|---|
| `DJANGO_SETTINGS_MODULE` | `config.settings.dev` | Django |
| `DJANGO_SECRET_KEY` | — (required) | Django sessions, CSRF |
| `DJANGO_ALLOWED_HOSTS` | `localhost,127.0.0.1` | Django |
| `CSRF_TRUSTED_ORIGINS` | `http://localhost` | Django |
| `PUBLIC_BASE_URL` | `http://localhost` | Links in emails (cancellation link, US-11) |
| `DATABASE_URL` | `postgres://starmie:starmie@db:5432/starmie` | Django |
| `RABBITMQ_URL` | `amqp://guest:guest@rabbitmq:5672/` | Channels layer |
| `STRIPE_SECRET_KEY` | `sk_test_...` | Stripe adapter |
| `STRIPE_PUBLISHABLE_KEY` | `pk_test_...` | Exposed to the front end |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` | Stripe webhook signature |
| `FIELD_ENCRYPTION_KEYS` | comma-separated Fernet keys, newest first | Guest PII encryption (US-20); several keys allow rotation |
| `EMAIL_HASH_KEY` | — (required) | Keyed hash of guest emails (US-20) |
| `OTA_WEBHOOK_SECRET_BOOKING_COM_MOCK` | — (required) | HMAC for the mock channel (US-07) |
| `OTA_WEBHOOK_SECRET_EXPEDIA_MOCK` | — (required) | HMAC for the mock channel (US-07) |
| `OTA_SIMULATOR_ENABLED` | `true` in dev, `false` in prod | Simulator screen and command (US-07) |
| `INITIAL_GM_EMAIL` | — (required on first install) | First General Manager, created by the seed (US-01) |
| `INITIAL_GM_TEMPORARY_PASSWORD` | — (required on first install) | Temporary password of the first GM; must be changed at first login (US-01) |
| `NIGHT_AUDIT_ALERT_EMAIL` | `guibragon@gmail.com` | Developer warning (US-14) |
| `EMAIL_HOST` / `EMAIL_PORT` | `mailpit` / `1025` in dev; Amazon SES SMTP endpoint (e.g., `email-smtp.ca-central-1.amazonaws.com` / `587`) in prod | SMTP |
| `EMAIL_HOST_USER` / `EMAIL_HOST_PASSWORD` | empty in dev | SMTP |
| `EMAIL_USE_TLS` | `false` in dev, `true` in prod | SMTP |
| `DEFAULT_FROM_EMAIL` | `no-reply@starmie.local` in dev; `no-reply@<motel domain>` in prod **[CONFIRM]** domain | Sender of all emails |
| `MEDIA_ROOT` | `/app/media` | File storage (section 3.3) |
| `LOG_LEVEL` | `INFO` | Logging |
| `VITE_API_BASE_URL` | `/api/v1` | Front end |
| `VITE_STRIPE_PUBLISHABLE_KEY` | `pk_test_...` | Stripe Elements (front end) |

Settings fail at start-up if a required variable is missing. Secrets are never logged.

### 2.5 Seed data

Seeds are **idempotent data migrations**, so every environment (dev, test, prod) starts with the same reference data. Values that the stories define as defaults are seeded with exactly those values; the General Manager edits them afterwards.

| Data | Seeded values | Source |
|---|---|---|
| Properties | `BEDFORD` — Bedford, America/Halifax, CAD, NS, front desk 24 hours. `TIMBERLEA` — Timberlea, America/Halifax, CAD, NS, front desk 08:00–00:00. | US-02 |
| Property policies | Deposit 250.00 CAD; no-show grace period 60 minutes; cancellation fee and no-show fee **empty (no fee)**; cancellation fee window 0 hours | US-11, US-13 |
| Tax rates | `HST` — 14% (0.1400), area NS, base "rate + prior taxes", sequence 2, effective 2025-04-01. `MARKETING_LEVY` — 3% (0.0300), area Halifax, base "room rate", sequence 1, effective 2023-10-01 (date the Halifax levy became 3%, per halifax.ca) | US-04 |
| Default Terms & Conditions | Version 1 per property, EN and FR, from `docs/Business Modeling/Default Terms and Conditions.md` (draft by Claude, decision 7A), with `{property_name}` replaced. Copied to `backend/starmie/terms/seeds/` when the code is created. **[CONFIRM]** owner approval and legal review before go-live | US-05, US-06, US-13 |
| Fine types | "Cannabis Cleaning Fine" / "Frais de nettoyage – cannabis", 250.00 CAD, per property | US-16 |
| OTA channels | `BOOKING_COM_MOCK` "Booking.com (mock)", `EXPEDIA_MOCK` "Expedia (mock)" | US-08 |
| Permission matrix | The default matrix of US-01 | US-01 |
| Invoice sequences | Prefix `BED` (Bedford) and `TIM` (Timberlea); one counter per property starting at 1; format `PREFIX-000001`; never restarts | US-17 |
| Company details | Legal name and GST/HST number left empty; the settings screen shows a warning to the GM until they are filled in | US-17 |
| First General Manager | Created by the seed (data migration, infrastructure layer) from `INITIAL_GM_EMAIL` and `INITIAL_GM_TEMPORARY_PASSWORD`, with `must_change_password = true`; skipped if a GM already exists | US-01 |

Not seeded: room types, rooms, rates and staff accounts other than the first GM (the GM registers them).

* **Demo data (dev only):** `python manage.py seed_demo` creates sample room types, rooms, rates, staff and reservations for local testing. It refuses to run when `DJANGO_SETTINGS_MODULE` is `prod`.

### 2.6 Developer commands

A `Makefile` at the root wraps the common tasks:

| Command | Does |
|---|---|
| `make up` / `make down` | Start / stop docker-compose |
| `make migrate` | Apply migrations (including seeds) |
| `make test` | Backend and front-end tests with coverage |
| `make lint` | ruff, mypy, import-linter, ESLint, Prettier check, `tsc --noEmit` |
| `make check` | `lint` + `test` — must pass before opening a Pull Request |
| `make schema` | Regenerate the OpenAPI schema |
| `make messages` | Extract and compile backend `.po` files |

---

## 3. External services

### 3.1 Email

| Environment | Backend | Notes |
|---|---|---|
| Development | SMTP to **Mailpit** (`mailpit:1025`) | Every email (EN/FR, with PDF attachments) can be opened in the Mailpit UI at `http://localhost:8025`. Nothing leaves the machine. |
| Tests | Django `locmem` backend | Tests assert on `django.core.mail.outbox`. |
| Production | **Amazon SES** through its SMTP interface, configured only by environment variables | The code stays provider-agnostic (plain SMTP). SES fits the AWS move in V2. The sender domain must be verified in SES with SPF, DKIM and DMARC records. **[CONFIRM]** sender domain |

Design:

* **Outbox pattern:** use cases never send email directly. After the database transaction commits, a row is written to `EMAIL_OUTBOX` (template, language, recipient reference, context, attachments). The `send_outbox_emails` cron job sends pending rows, retries failures up to 5 times with back-off, then marks them `FAILED` and logs the error. A Stripe or SMTP outage never rolls back a booking.
* **Templates:** `backend/templates/emails/<name>.<lang>.html` and `.txt` (plain-text alternative), for `booking_received`, `booking_confirmed`, `fine_posted`, `fee_notice`, `invoice`, `password_reset` (staff language, US-24) and `night_audit_failed` (developer, English only). Guest emails use the reservation's language (US-06, US-16, US-17).
* **Privacy:** the outbox stores the guest id, not the email address, and resolves the address at send time; after "Forget Me" (US-21) pending emails for that guest are cancelled.
* Emails are excluded from the 1.5 s rule (US-10) because they are sent outside the request.

### 3.2 Stripe

**Test mode in V1 development:** `sk_test_` / `pk_test_` keys only; production keys are configured only in the production environment. Stripe's test cards are used in tests and demos (e.g., `4242 4242 4242 4242` approved, `4000 0000 0000 0002` declined, `4000 0025 0000 3155` requires 3-D Secure).

| Story | Stripe object | Notes |
|---|---|---|
| US-06, US-09 | `Customer` + `PaymentIntent` (`capture_method=automatic`, `setup_future_usage=off_session`) | Charges the full stay and keeps the card for later use. Card data is entered in Stripe Elements only. |
| US-13 | `PaymentIntent` (`capture_method=manual`) | Deposit hold for the property's amount. |
| US-16, US-17 | `PaymentIntent` capture (partial) / cancel; off-session `PaymentIntent` for extra charges | Partial capture releases the remainder automatically. |
| US-06, US-11, US-15, US-17 | `Refund` | Rejections, cancellations, no-shows, early departure, GM corrections. |
| US-21 | `Customer.delete` | Removes the customer and its saved cards. |

All Stripe calls go through one `StripePaymentGateway` adapter behind the `PaymentGateway` port, with an idempotency key per operation. Unit tests use a fake gateway; a small set of integration tests hit Stripe test mode and are marked `@pytest.mark.stripe` (skipped when no test key is present).

**Stripe webhooks** — some results arrive later than the API call (refunds can stay `pending` and fail days later; holds can be cancelled by Stripe; 3-D Secure completes asynchronously):

* Endpoint: `POST /api/v1/webhooks/stripe`, CSRF-exempt, verified with `STRIPE_WEBHOOK_SECRET` (`stripe.Webhook.construct_event`). Invalid signature → `400`, nothing processed.
* Idempotency: every processed event id is stored in `STRIPE_EVENT`; a repeated event is acknowledged with `200` and ignored.
* Each handler is a short status update in the database, so the endpoint answers `2xx` within a few hundred milliseconds and Stripe does not retry needlessly. Any follow-up work (e.g., an email) goes through the outbox (section 3.1).

| Event | Effect |
|---|---|
| `refund.updated` (status `succeeded`) | `REFUND.status = SUCCEEDED` |
| `refund.updated` / `refund.failed` (status `failed`) | `REFUND.status = FAILED` → shown in the Held Funds report with "Retry refund" (US-22) |
| `payment_intent.canceled` (deposit hold) | `DEPOSIT.status = RELEASED` if expected, otherwise logged and flagged on the reservation |
| `payment_intent.succeeded` / `payment_intent.payment_failed` | Confirms or fails a payment that needed 3-D Secure |
| `charge.dispute.created` | Logged and recorded in the audit log for the GM (no automatic action; disputes are out of scope for V1) |

* Local development: the `stripe-cli` service runs `stripe listen --forward-to nginx/api/v1/webhooks/stripe` and prints the `whsec_` secret for `.env`.

### 3.3 File storage (photos and PDFs)

**V1: local filesystem through Django's storage API**, on the `media` Docker volume. Moving to object storage (AWS S3) in V2 only changes the storage backend setting, not the code.

| Files | Path | Access |
|---|---|---|
| Room type photos (US-02) | `media/public/room-types/<room_type_id>/<uuid>.<ext>` | **Public**, served by nginx (they are shown in the booking widget). Resized to a maximum width (e.g., 1600 px) on upload. |
| Violation evidence (US-16) | `media/private/violations/<report_id>/<uuid>.<ext>` | **Private**. Never served by nginx; downloaded only through an authorized endpoint (`FRONT_DESK_WORK` or GM). Kept until the GM deletes it. HEIC is stored as uploaded and converted to JPEG for viewing (`pillow-heif`). |
| Invoices (US-17) | `media/private/invoices/<property_code>/<year>/<number>.pdf` | **Private**. Generated once at check-out and stored, so an issued invoice never changes (US-21). Downloaded through an authorized endpoint; attached to the invoice email. |
| Reports (US-22, US-23) | Not stored | Generated on demand (PDF via WeasyPrint, CSV) and streamed to the GM. |

Rules:

* File names are random UUIDs, never the original name (no PII, no path traversal).
* Uploads are checked by content (magic bytes), not only by extension, and by size (10 MB per photo, US-16).
* **Backups (database and `media` volume):** daily backups kept 7 days, weekly backups kept 4 weeks, monthly backups kept 12 months. Database dumps with `pg_dump`, files archived from the `media` volume, both stored outside the server. A restore is tested at least once before go-live. Long-term financial records are kept in the database itself, which never deletes them.

---

## 4. Front-end i18n

### 4.1 Library and setup

* **`i18next` + `react-i18next`**, with lazy-loaded namespaces.
* Supported languages: `en` and `fr` only (business rule). Fallback language: `en`.
* Formatting with the browser's `Intl` API, locales `en-CA` and `fr-CA`:
  * money: `Intl.NumberFormat(locale, { style: "currency", currency: "CAD" })` → `$117.42` / `117,42 $`;
  * dates: `Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: property.timezone })`.
* Mantine date components use the matching `dayjs` locale (`en`, `fr`).

### 4.2 File layout

```
frontend/src/i18n/
├── index.ts                 # i18next init, language detection, Intl helpers
└── locales/
    ├── en/
    │   ├── common.json      # buttons, navigation, generic labels, error codes
    │   ├── booking.json     # public widget
    │   ├── frontDesk.json
    │   ├── housekeeping.json
    │   ├── guests.json
    │   ├── reports.json
    │   └── settings.json
    └── fr/
        └── (same files, same keys)
```

Key conventions:

* Keys are `camelCase` and grouped by screen: `booking.search.checkIn`, `booking.terms.acceptLabel`.
* Error codes from the API map to `common:errors.<CODE>`, e.g., `common:errors.ROOM_NO_LONGER_AVAILABLE`.
* Enum labels map to `common:enums.<ENUM>.<VALUE>`, e.g., `common:enums.reservationStatus.IN_HOUSE`.
* Plurals use i18next plural suffixes (`nights_one`, `nights_other`).
* No text is hard-coded in components; an ESLint rule (`i18next/no-literal-string`) enforces this in `features/`.

### 4.3 Language selection

* **Guest booking widget (US-03):** a visible EN/FR selector; initial value from `?lang=` in the URL, then the browser language (`fr*` → `fr`, anything else → `en`). The chosen language is sent with the booking and becomes the reservation's language for emails and the invoice (US-06, US-17). Remembering the choice in `localStorage` is a convenience only (wrapped in try/catch).
* **Staff screens (US-24):** the language comes from the staff account (`GET /api/v1/auth/me` → `language`, default `en`). Changing it calls `PATCH /api/v1/auth/me/language` and `i18n.changeLanguage()`. Report exports use the exporting staff member's language; guest-facing content always uses the guest's language.

### 4.4 Content that is not in the JSON files

| Content | Where its EN/FR text lives |
|---|---|
| Room type names and descriptions, T&C text, fine type names | Database (`*_en` / `*_fr` columns), entered by the GM (US-02, US-05, US-16) |
| Emails, invoice PDF | Backend Django templates + `locale/en` and `locale/fr` `.po` files |
| API error messages | Translated on the front end from `code` (section 1.3) |

### 4.5 Translation quality checks

* A unit test fails when `en` and `fr` files do not have exactly the same keys.
* A unit test fails when a backend `.po` file has untranslated or fuzzy entries.
* French texts are drafted by Claude and reviewed by a native French speaker (staff member or translator) before release. **[CONFIRM]** the reviewer's name.

---

## 5. Code quality and Definition of Done

### 5.1 Backend (Python)

| Tool | Configuration |
|---|---|
| **ruff** (lint + format) | In `pyproject.toml`; rule sets `E, F, W, I, B, UP, N, S, DJ, PL, RUF`; line length 100; `ruff format` replaces Black. |
| **mypy** | `strict = true` for `*/domain/*` and `*/application/*`; standard checking with `django-stubs` and `djangorestframework-stubs` for `infrastructure` and `interface`. No `Any` in domain code. |
| **import-linter** | Contracts: `domain` imports nothing from Django/DRF/Stripe; layers only depend inward; modules do not import each other's `infrastructure`. |
| **pytest** | `pytest-django`, `pytest-cov`, `factory-boy` for test data, `freezegun` (or `time-machine`) for time and DST tests. |
| **pre-commit** | Runs ruff, ruff format, mypy (changed files), Prettier, ESLint on every commit. |

### 5.2 Front end (TypeScript)

| Tool | Configuration |
|---|---|
| **TypeScript** | `strict: true`, `noUncheckedIndexedAccess: true`; `tsc --noEmit` in `make lint`. |
| **ESLint** | `typescript-eslint` recommended + `react-hooks` + `jsx-a11y` + `i18next/no-literal-string`. |
| **Prettier** | Default settings, `printWidth: 100`. |
| **Vitest + React Testing Library** | Component and hook tests; Mock Service Worker (`msw`) to fake the API. |

### 5.3 Minimum test coverage ("Test coverage implemented")

| Scope | Minimum (line + branch) |
|---|---|
| Backend `domain` and `application` layers | **95%** |
| Backend overall | **85%** |
| Front end `features/` and `shared/` | **75%** |

A story's "Test coverage implemented" item is done only when **all** of the following are true:

1. Every acceptance scenario of the story has at least one automated test, named after it, e.g. `test_us11_s4_cancellation_with_fee`.
2. Every business rule that has a number or a formula (fees, taxes, deadlines, rounding, limits) has a unit test with the story's example values.
3. The coverage minimums above still pass (`pytest --cov-fail-under=85` and the per-layer check).
4. Critical constraints have dedicated tests where the story touches them: state machine transitions (allowed and blocked), money precision, idempotency, optimistic locking, timezone and DST, permission matrix and property scope.

In V1 there is no CI (it arrives in V2), so `make check` is run locally and its result is shown in the Pull Request.

### 5.4 "Code reviewed via Pull Request"

* One story (or one clearly scoped part of it) per Pull Request.
* The PR template contains the story id, the DoD checklist and the `make check` output.
* At least one approval before merge. The reviewer checks the story's scenarios against the tests, SOLID / Clean Architecture rules and that no business rule was invented.

### 5.5 "Documentation and Wiki updated"

The item is done when **every applicable** point below is true:

| # | Update | When |
|---|---|---|
| 1 | OpenAPI schema regenerated (`make schema`), endpoints, errors and permissions described | Any API change |
| 2 | `docs/Wiki/<module>.md` updated: purpose, endpoints, domain events, scheduled jobs, environment variables, how to test the story manually | Any change in that module |
| 3 | The story's diagram file in `docs/Initial Requirements/Diagrams/` updated when the implemented model differs from it | Design change |
| 4 | `.env.example` and section 2.4 updated | New or changed environment variable |
| 5 | An ADR in `docs/ADR/NNNN-title.md` (context, decision, consequences) | An architecture or technology decision (e.g., a new library) |
| 6 | `CHANGELOG.md` entry under "Unreleased" | Every PR |
| 7 | EN and FR translations added for every new text | Any UI, email or PDF text |

"Wiki" therefore means the `docs/Wiki/` folder in the repository, versioned with the code, so documentation is reviewed in the same Pull Request.

---

## 6. Libraries added by this spec

These are libraries inside the V1 technologies (Django, React, Docker), not new technologies. Each one gets an ADR when it is introduced (5.5, point 5).

| Area | Libraries |
|---|---|
| Backend runtime | `djangorestframework`, `drf-spectacular`, `channels`, `channels-rabbitmq`, `daphne`, `stripe`, `weasyprint`, `cryptography` (Fernet), `argon2-cffi`, `pillow`, `pillow-heif`, `dj-database-url`, `psycopg` |
| Backend dev/test | `ruff`, `mypy`, `django-stubs`, `djangorestframework-stubs`, `import-linter`, `pytest`, `pytest-django`, `pytest-cov`, `factory-boy`, `freezegun`, `pre-commit` |
| Front-end runtime | `@mantine/core`, `@mantine/dates`, `@mantine/form`, `@mantine/notifications`, `@stripe/stripe-js`, `@stripe/react-stripe-js`, `i18next`, `react-i18next`, `react-router`, `@tanstack/react-query`, `dayjs` |
| Front-end dev/test | `vite`, `vitest`, `@testing-library/react`, `msw`, `eslint`, `typescript-eslint`, `prettier` |
| Dev-only containers | Mailpit, Stripe CLI, nginx |

---

## 7. Project owner decisions

Decided on 2026-11-03:

| # | Item | Decision |
|---|---|---|
| 1 | Production email provider | Amazon SES (SMTP) |
| 2 | Default Terms & Conditions | Drafted by Claude in `docs/Business Modeling/Default Terms and Conditions.md`; owner approval and legal review before go-live |
| 3 | French name of the Cannabis Cleaning Fine | "Frais de nettoyage – cannabis" |
| 4 | Invoice number format | `PREFIX-000001` per property (`BED`, `TIM`), never restarts |
| 5 | First General Manager account | Created by the seed (infrastructure layer) from environment variables |
| 6 | Staff interface language | EN or FR saved on each staff account, default EN (US-24) |
| 7 | Backups | Daily kept 7 days, weekly kept 4 weeks, monthly kept 12 months |
| 8 | French texts | Drafted by Claude, reviewed by a native French speaker |
| 9 | Coverage minimums | 95% domain/application, 85% backend overall, 75% front end |

Still open **[CONFIRM]**:

| # | Item | Default until decided |
|---|---|---|
| A | Sender domain for emails (`no-reply@<domain>`) | `starmie.local` in dev; production email blocked until set |
| B | Name of the native French reviewer | — |
| C | Source for the leaked-password check (US-01): Have I Been Pwned range API (k-anonymity, an external call) or an offline breached-password list | Common-password list only |
| D | Legal review of the Terms & Conditions | — |
