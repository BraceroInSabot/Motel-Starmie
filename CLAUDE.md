# CLAUDE.md — Starmie Motel PMS

> Sources of truth (in this repository):
> - Business: `docs/Business Modeling/Business Modeling.md`
> - Technology: `docs/Tech Stack/Tools.md`
> - Functional requirements: user stories generated from the documents above.
>
> Reference business (inspiration only): stardustmotel.ca — a family-run motel in Halifax, Nova Scotia.
> Use it to understand the context; never copy its name, branding or content, and never turn its practices into business rules unless the project owner confirms them.

---

## 1. Role and expected conduct

- Act as a **Senior Software Engineer**: analytical, technical, focused on software engineering, architecture, clean code and testing.
- Responses must always keep a **technical tone**.
- **Golden rule about the business:** business rules are defined by the project owner in the documents above.
  **When in doubt, ASK. Never design, assume or invent business rules.**
- The business **has no color palette, logo or visual identity**. Do not create or suggest one; use the default MantineUI theme until instructed otherwise.

---

## 2. Mandatory standards for all generated code

| Standard | Practical application |
|---|---|
| **SOLID** | Single responsibility; extension through abstractions; substitutable contracts; lean interfaces; depend on abstractions, not implementations. |
| **Clean Code** | Expressive names, small functions, no duplication, explicit error handling, no "magic numbers". |
| **Clean Architecture** | Layers with dependencies pointing inward (domain). The domain knows nothing about Django, the ORM, HTTP, RabbitMQ or payment gateways. |
| **REST API** | Plural-noun resources, semantic HTTP verbs, correct status codes, consistent JSON, versioned routes (e.g. `/api/v1/...`). |

### 2.1 Clean Architecture (Django backend)

1. **Domain** — entities (Property, RoomType, Room, GuestProfile, Reservation, Folio), value objects (e.g. Money), state machines, repository interfaces. Pure Python.
2. **Application** — use cases (booking, check-in, night audit, check-out…) depending only on ports.
3. **Infrastructure** — Django ORM, PostgreSQL repositories, payment gateway adapter, channel manager adapter, email/i18n, RabbitMQ, cron jobs.
4. **Interface** — REST views, serializers, webhooks, routing.

Rules: dependencies only point inward; ORM models are not domain entities; external services are injected behind ports (gateway, channel manager, tax engine, clock).

### 2.2 Testing

- Unit tests for domain and use cases (no database; fakes for ports), integration tests for repositories, REST endpoints and webhooks.
- State machines, tax calculation, folio balance, idempotency and concurrency must have dedicated tests.
- New code is not done without tests.

---

## 3. Technology stack (`docs/Tech Stack/Tools.md`)

| Layer | Technologies |
|---|---|
| Front-end | HTML, CSS, JavaScript, React, TypeScript, MantineUI |
| Backend | Python, Django, cron, RabbitMQ |
| Infrastructure & Database | Docker, Kubernetes, Terraform, PostgreSQL, Zabbix, Protheus |

> ⚠️ To confirm with the project owner: the project instructions also mention Poetry, pytest, CI/CD, AWS, VPS deployment and a phased rollout (V1 → V3) that only advances on request. `Tools.md` lists a single stack without phases. Until confirmed, do not assume `Tools.md` replaces the phasing.

---

## 4. Business context (`Business Modeling.md`)

**System:** cloud-native Property Management System (PMS) for high-turnover Canadian motels operating **multiple locations** (Bedford and Timberlea, Nova Scotia): real-time inventory distribution, front-desk operations, strict financial ledgers with Canadian tax compliance (GST/HST/PST), housekeeping workflows, enforcement of local property policies and Group/Corporate/Extended-Stay requests. **Only English and French** are supported, for guests and staff.

### 4.1 Personas / roles
| Persona | Needs |
|---|---|
| Front Desk Agent (primary) | Walk-ins, check-ins, phone calls. Fast, keyboard-friendly dashboard flagging missing requirements (deposit, ID). |
| General Manager / Owner | Yield management, occupancy, financial reporting, Night Audit reports, tax summaries, OTA channel mapping. |
| Housekeeper | Mobile/tablet; real-time room list grouped by `Checkout/Dirty`, `Stayover`, `Clean`; no financial data. |
| Head Housekeeper | Verifies cleaned rooms (Cleaning → Available). |
| Night Auditor | Graveyard shift; runs End of Day: posts room charges and taxes to occupied rooms at a cutoff time. |
| Guest | Chooses the location, then books through the public widget (EN/FR); sees strict policies before paying; can submit Group/Corporate/Extended-Stay requests. |

### 4.2 Core entities
- **Property** — each location (Bedford, Timberlea): own timezone (both America/Halifax), CAD, tax jurisdiction and front-desk hours. RoomTypes, Rooms, inventory, Reservations, Folios and Night Audit runs belong to one property.
- **RoomType** (template, e.g. "Double Queen") and **Room** (physical asset, e.g. "Room 101").
- **GuestProfile** — PII; `PIPEDA_consent_flag`; supports anonymization.
- **Reservation** — `Unconfirmed → Confirmed → In-House → Checked-Out`, plus `Canceled` / `No-Show`.
- **StayRequest** — Group, Corporate or Extended-Stay request for one or both properties.
- **Folio** — one per reservation; double-entry ledger of Charges (room rate, fines) and Payments (cash, credit card, deposits). Balance must be 0.00 to check out.

### 4.3 Room state machine
`Available → Occupied` (check-in) `→ Dirty` (check-out) `→ Cleaning → Available` (verified by Head Housekeeper). A guest can never be placed in an uncleaned room.

### 4.4 Guest lifecycle
1. **Booking (direct or OTA webhook):** location choice → availability per property with concurrency check → totals with localized taxes → T&C acceptance (Age 21+, No Pets, No Smoking/Cannabis) → card tokenization → reservation + confirmation email in the chosen language.
2. **Check-in (from 4:00 PM):** government ID check; age < 21 blocks check-in unless management hard override; **$250 CAD pre-authorization hold**; reservation → In-House, room → Occupied.
3. **Stay & Night Audit:** scheduled per property (e.g. 2:00 AM local) posting of nightly rate + daily taxes to every In-House folio.
4. **Check-out (strictly by 11:00 AM):** zero balance → release hold; violation (e.g. smoke) → $250 Cannabis Cleaning Fine captured from the hold; reservation → Checked-Out, room → Dirty; zero-balance invoice emailed.

### 4.5 Multi-property operation
| Property | Front-desk hours |
|---|---|
| Bedford, NS | 24 hours |
| Timberlea, NS | 8:00 AM to 12:00 AM (midnight), daily |

Availability, overbooking prevention, taxes (jurisdiction of the property), Night Audit (property's local time) and reports are evaluated per property.

### 4.6 Group, Corporate & Extended-Stay requests
- Not instant bookings: submitted through a public EN/FR form and handled by staff.
- Form: name*, email*, phone, property* (Bedford, Timberlea or Both), request type* (Group Booking, Extended Stay, Corporate Accommodation), message* (* required).
- Organizations that book regularly can apply for a corporate/organization discount.
- PIPEDA applies; public forms need spam protection.

### 4.7 Languages
- Only **English and French**, for the guest-facing experience (widget, forms, emails, invoices) and the staff interface.
- Guest communications always follow the guest's chosen language.

### 4.8 Architectural constraints (non-negotiable)
- **Money:** never `float`/`double`; use `Decimal` or integer cents. Modular tax engine (rates vary by province/municipality).
- **Idempotency:** channel manager webhooks use the OTA Booking ID as idempotency key.
- **Time:** store all timestamps in UTC; convert at the presentation layer; Night Audit cron is timezone-aware.
- **Security / PIPEDA / PCI-DSS:** no own card storage — gateway hosted elements (Stripe/Adyen); "Forget Me" scrubs PII, keeping only anonymous demographic data attached to financial records.
- **Concurrency:** optimistic locking on `RoomInventory` to prevent overbooking.

---

## 5. Open points — ask before implementing

- Tax rate: the document's example is 15% HST (Nova Scotia), but the NS HST has been **14% since April 1, 2025**. Municipal levies and rounding rules are undefined.
- Number of rooms and room types; room type attributes and rate structure.
- Multi-property: staff assignment per property, shared guest profiles, consolidated reports, Timberlea arrivals while the desk is closed, separate OTA listings, policies identical or per property.
- Stay requests: handling role, statuses/response time, group and extended-stay thresholds, corporate discount rules, conversion into reservations, master folio, pricing/deposit/cancellation.
- Staff language: saved preference or per session; default language.
- Payment gateway (Stripe or Adyen); when room charges are paid; cash guests and deposits; partial hold capture; hold expiration.
- Reservation transitions to Canceled/No-Show; cancellation/no-show fees.
- Mapping between housekeeping groups (Checkout/Dirty, Stayover, Clean) and room states; extra states (Out of Order).
- Night Audit cutoff time and re-run behavior.
- Fines other than the Cannabis Cleaning Fine; how housekeeping reports violations.
- Channel manager (e.g. SiteMinder) contract, modifications/cancellations, OTA channels.
- Permission matrix per role; authentication policy.
- Early check-in / late check-out handling.
- Report contents (Night Audit, tax summary, occupancy/yield KPIs).
- Stack phasing (see section 3).

---

## 6. Checklist before delivering any code

- [ ] SOLID, Clean Code, Clean Architecture and REST respected?
- [ ] Only technologies approved for the current phase?
- [ ] Every business rule applied is documented or confirmed by the project owner?
- [ ] Money as Decimal/cents, timestamps in UTC, idempotency and locking where required?
- [ ] Tests cover domain, use cases and the critical constraints?
- [ ] No invented visual identity?
