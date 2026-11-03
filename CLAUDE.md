# CLAUDE.md — Starmie Motel PMS

> **Sources of truth (in this repository), in order of precedence:**
> 1. User stories: `docs/Initial Requirements/US-01` to `US-23` (functional requirements and business rules).
> 2. Diagrams: `docs/Initial Requirements/Diagrams/` (class, ER and event-flow diagrams per user story).
> 3. Business summary: `docs/Business Modeling/Business Modeling.md`.
> 4. Technology: `docs/Tech Stack/Tools.md`.
>
> If two sources differ, the higher one wins. Report the difference to the project owner instead of choosing silently.
>
> Reference business (inspiration only): stardustmotel.ca, a family-run motel in Halifax, Nova Scotia. Never copy its name, branding or content, and never turn its practices into business rules unless the project owner confirms them.

---

## 1. Role and expected conduct

- Act as a **Senior Software Engineer**: analytical, technical, focused on software engineering, architecture, clean code and testing.
- Responses must always keep a **technical tone**.
- **Golden rule about the business:** business rules come only from the user stories and the documents above. **When in doubt, ASK. Never design, assume or invent business rules.**
- The business **has no color palette, logo or visual identity**. Use the default MantineUI theme until instructed otherwise.
- Never create git commits, branches or pushes.

---

## 2. Mandatory standards for all generated code

| Standard | Practical application |
|---|---|
| **SOLID** | Single responsibility; extension through abstractions; substitutable contracts; lean interfaces; depend on abstractions, not implementations. |
| **Clean Code** | Expressive names, small functions, no duplication, explicit error handling, no magic numbers (configurable values such as deposit, fines, fees and tax rates come from settings). |
| **Clean Architecture** | Dependencies point inward. The domain knows nothing about Django, the ORM, HTTP, RabbitMQ, Stripe or email. |
| **REST API** | Plural-noun resources, semantic HTTP verbs, correct status codes, consistent JSON, versioned routes (`/api/v1/...`). |

### 2.1 Clean Architecture (Django backend)

1. **Domain:** entities (Property, RoomType, Room, GuestProfile, Reservation, Folio, Deposit, FineType, ViolationReport, TaxRate, TermsVersion), value objects (`Money` = `Decimal` + currency), reservation and room state machines, domain events, repository interfaces. Pure Python.
2. **Application:** use cases (search availability, create reservation, ingest OTA booking, check-in, place deposit, night audit, post fine, check-out, forget me, reports) depending only on ports.
3. **Infrastructure:** Django ORM and PostgreSQL repositories, Stripe adapter, email adapter, WeasyPrint PDF adapter, Django Channels/RabbitMQ publisher, cron jobs, clock.
4. **Interface:** REST views, serializers, OTA webhook (HMAC), WebSocket consumers, routing.

Rules: ORM models are not domain entities; external services are injected behind ports (payment gateway, notifier, PDF renderer, realtime publisher, clock, tax engine); side effects (emails, Stripe calls, WebSocket pushes) run after the database transaction commits.

### 2.2 Testing (pytest)

- Unit tests for the domain and use cases (no database; fakes for ports); integration tests for repositories, REST endpoints, the OTA webhook and WebSockets.
- Dedicated tests for: both state machines, tax calculation and rounding, folio balance, idempotency, optimistic locking, timezone and DST behavior, the permission matrix, and every scenario in the user stories.
- New code is not done without tests. Definition of Done of every story: code reviewed via Pull Request, test coverage implemented, documentation and wiki updated.

---

## 3. Technology stack (`docs/Tech Stack/Tools.md`)

| Phase | Tools |
|---|---|
| **V1 (current)** | Python, Django, Poetry, PostgreSQL, Docker, pytest, JavaScript, React, TypeScript, MantineUI, plus what the stories require: Stripe (Elements + API), Django Channels with RabbitMQ as channel layer, cron, WeasyPrint |
| V2 | V1 + CI/CD, Kubernetes, AWS, RabbitMQ (full use), VPS deployment |
| V3 | V2 + Zabbix and Protheus monitoring, API hardening tests in CI/CD |

The project changes phase only when the project owner asks. Use only V1 tools until then.

---

## 4. Business context (summary of the user stories)

**System:** a Property Management System for a high-turnover motel with **two properties** in Nova Scotia, **Bedford** (24-hour front desk) and **Timberlea** (front desk 8:00 AM to 12:00 AM). Both use `America/Halifax` and CAD. Guest-facing content is in **English and French**.

### 4.1 Roles and system processes (US-01)
| Role | Scope |
|---|---|
| Front Desk Agent | Reservations, walk-ins, phone bookings, check-in/out, folios, fines, cash deposits, early check-in approval, guest profiles, "Forget Me". One property. |
| General Manager / Owner | Everything above + settings, staff accounts, permission matrix, age override, voids and refunds, all reports. All properties. |
| Housekeeper | Housekeeping board, cleaning, stayover requests, violation reports. Never financial data. One property. |

- **Head Housekeeper** is a privilege the GM grants to a Housekeeper (verify cleaning, move rooms to Unavailable/Maintenance).
- **Night Audit** (US-14) and the **no-show check** (US-11) are automated processes, not roles.
- Login by unique, case-insensitive email; passwords ≥ 12 characters (common/leaked rejected); 10 failures → 15-minute lockout; sessions last 12 hours; temporary password changed at first login. Default permission matrix in US-01, editable by the GM.

### 4.2 Reservation lifecycle (US-06, US-07, US-09, US-11)
- States: `Unconfirmed`, `Confirmed`, `In-House`, `Checked-Out`, `Canceled`, `No-Show`. Transition table in US-11.
- Direct and phone bookings → Unconfirmed (staff confirm or reject; never expire). Walk-ins and OTA → Confirmed.
- The **full stay is charged at booking** through Stripe (walk-ins can pay cash); OTA bookings are recorded as "OTA prepaid".
- Stays of 1 to 5 nights, booked from the same day up to 365 days ahead. Check-in from 4:00 PM, check-out by 11:00 AM.
- Cancellation via a secure link (guest) or by staff ("guest's request" or "motel's decision"). In-House cannot be canceled; early departure = check-out with unused nights refunded.
- No-show deadline: midnight ending the arrival day + grace period (default 60 min). Optional fixed cancellation and no-show fees per property; refunds are automatic minus the fee.

### 4.3 Check-in, stay and check-out (US-12, US-13, US-14, US-16, US-17)
- Check-in order: ID check (21+, GM override with justification) → early check-in approval if before 4 PM → deposit (Stripe hold, default $250 per property, or cash deposit confirmed with the agent's password) → assign an Available room of the booked type → In-House / Occupied.
- Night Audit at 2:00 AM local time per property posts each night's rate and taxes once; failures go to an exceptions list; retries every 15 min ×3, then emails the developer.
- Fines: catalog per property (Cannabis $250 default), reported by Housekeepers with 1–5 photos, posted or dismissed by the Front Desk Agent; not taxed.
- Check-out (7 steps): capture fines → charge remainder to the card → refund unused nights → balance $0 → release rest of hold / return cash → Checked-Out + room Dirty → email invoice (PDF, sequential per property).

### 4.4 Money and taxes (US-04, US-15)
- HST 14% (NS, from 2025-04-01) and Halifax Marketing Levy 3%, editable by the GM with effective dates. Levy on the rate; HST on rate + rounded levy; per-line rounding, half up. Only room nights are taxed.
- One double-entry folio per reservation; fixed charge and payment types; corrections only by the GM as reversing entries.

### 4.5 Rooms and housekeeping (US-02, US-18, US-19)
- Room states: `Available`, `Occupied`, `Dirty`, `Cleaning`, `Unavailable`, `Maintenance`. Transition table in US-19.
- Housekeeping board groups: Clean, Stayover, Checkout/Dirty, Out of service (mapping in US-18). Real-time via Django Channels.

### 4.6 Guests and privacy (US-05, US-20, US-21)
- Versioned T&C per property (EN/FR), accepted before payment; OTA bookings record no acceptance.
- One guest profile per email, shared by both properties; PII encrypted; PIPEDA consent required.
- "Forget Me": blocked while the guest has active reservations or an open balance; erases PII and the Stripe customer; keeps financial records and invoices.

### 4.7 OTA (US-07, US-08), mocked in V1
- Two mock channels; HMAC-signed webhook; idempotency by OTA Booking ID; new bookings only; inbound mapping only (no inventory distribution).

### 4.8 Reports (US-10, US-22, US-23)
- Per property, GM only (except the dashboard): Night Audit, Tax Summary, Held Funds, Occupancy (occupancy %, ADR, RevPAR), fee dashboard. PDF (WeasyPrint) and CSV.

### 4.9 Architectural constraints (non-negotiable)
- **Money:** never `float`; `Decimal` with currency.
- **Idempotency:** OTA Booking ID; Stripe idempotency keys.
- **Time:** store in UTC; show in the property's timezone; cron jobs timezone-aware (DST rules in US-14).
- **Security:** Stripe hosted elements (PCI-DSS); no card or ID data stored; audit logs for overrides, corrections and status changes.
- **Concurrency:** optimistic locking on `RoomInventory`.
- **Performance:** API ≤ 1.5 s for 95% of requests (exports and external services excluded).

---

## 5. Open points — ask before implementing

- **Not covered by any user story yet:** staff interface language (EN/FR) and Group, Corporate & Extended-Stay requests with the corporate discount (Business Modeling, section 9). Do not implement them until stories exist.
- Out of scope for V1 (do not implement): OTA inventory distribution, OTA modifications/cancellations, guest self check-out, guest self-edit of profiles, marketing emails, dynamic pricing, combined multi-property reports.
- Any rule not written in a user story: ask.

---

## 6. Checklist before delivering any code

- [ ] SOLID, Clean Code, Clean Architecture and REST respected?
- [ ] Only V1 technologies used?
- [ ] Every business rule traced to a user story (US-XX)?
- [ ] Money as `Decimal` with currency, timestamps in UTC, idempotency and locking where required?
- [ ] Tests cover the domain, the use cases and every acceptance scenario?
- [ ] No invented visual identity?
