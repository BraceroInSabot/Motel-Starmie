# Starmie Motel PMS: Development Guide
**System Description:** A robust, cloud-native Property Management System (PMS) tailored for high-turnover Canadian motels operating **multiple locations** (initially two properties: Bedford and Timberlea, Nova Scotia). The system handles real-time inventory distribution, front-desk operations, strict financial ledgers with complex Canadian tax compliance (GST/HST/PST), and housekeeping workflows, while enforcing rigorous local property policies. It also receives Group, Corporate and Extended-Stay requests, and is available **only in English and French** for guests and staff.

---

## 1. Personas (System Users)

Understanding who uses the system is critical for designing the UI/UX and role-based access control (RBAC).

*   **The Front Desk Agent (Primary User):** Needs extreme efficiency. They handle walk-ins, check-ins, and phone calls. Their dashboard must be fast, keyboard-friendly, and clearly flag missing requirements (like a missing deposit or ID).
*   **The General Manager / Owner:** Focuses on yield management, occupancy rates, and financial reporting. Needs access to Night Audit reports, tax summaries, and OTA (Online Travel Agency) channel mapping.
*   **The Housekeeper:** Usually uses a mobile or tablet interface. They don't need financial data; they only need a real-time list of rooms grouped by status (`Checkout/Dirty`, `Stayover`, `Clean`) to update room states instantly.
*   **The Night Auditor:** Works the graveyard shift. Responsible for running the "End of Day" process, which posts room charges and taxes to all occupied rooms at a specific cutoff time (e.g., 2:00 AM).
*   **The Guest (Self-Service/Booking Engine):** Interacts with the public-facing booking widget. First selects the location (Bedford or Timberlea). Needs a seamless, bilingual (EN/FR) experience that clearly communicates strict policies before taking payment. Can also submit Group, Corporate or Extended-Stay requests (see Section 6).

---

## 2. Business Modeling (Domain Driven Design)

These are the core entities and their relationships. 

### Core Entities
*   **Property:** Represents each motel location (Bedford, Timberlea). Each property has its own name, timezone (both currently `America/Halifax`, AST/ADT), base currency (CAD), tax jurisdiction (province/municipality) and front-desk hours. RoomTypes, Rooms, inventory, Reservations and Night Audit runs always belong to a single Property (see Section 5).
*   **RoomType & Room:** `RoomType` defines the template (e.g., "Double Queen"). `Room` is the physical asset (e.g., "Room 101").
*   **GuestProfile:** Contains PII (Personally Identifiable Information). Must include `PIPEDA_consent_flag` and support data anonymization.
*   **Reservation:** The booking intent. Has states: `Unconfirmed` $\rightarrow$ `Confirmed` $\rightarrow$ `In-House` $\rightarrow$ `Checked-Out` $\rightarrow$ `Canceled`/`No-Show`. Every reservation belongs to exactly one Property.
*   **StayRequest:** A Group, Corporate or Extended-Stay request submitted by a prospective guest or organization for one or both properties (see Section 6).
*   **Folio (The Ledger):** Every reservation has a Folio. It is a double-entry accounting ledger recording all `Charges` (Room rate, Fines) and `Payments` (Cash, Credit Card, Deposits). The balance must be 0.00 to complete a check-out.

### The Room State Machine
Rooms dictate inventory. A strict state machine is required to prevent placing a guest in an uncleaned room:
`Available` $\rightarrow$ `Occupied` (upon Check-in) $\rightarrow$ `Dirty` (upon Check-out) $\rightarrow$ `Cleaning` (in progress) $\rightarrow$ `Available` (verified by Head Housekeeper).

---

## 3. Complete Flux (The Guest Lifecycle)

This is the end-to-end journey the system must support.

### Phase 1: Booking (Direct or via OTA webhook)
1. Guest selects the location (property) and dates; system checks availability for that property (concurrency check required).
2. System calculates totals applying localized taxes (e.g., 15% HST in Nova Scotia).
3. Guest accepts Terms & Conditions (Age 21+, No Pets, No Smoking/Cannabis).
4. System securely tokenizes the credit card. 
5. Reservation is created; confirmation email sent in chosen language (i18n).

### Phase 2: Check-in (Starts at 4:00 PM)
1. Guest arrives. Agent pulls up the `Reservation`.
2. **Policy Enforcement Check:** Agent verifies government ID. If DOB calculates age < 21, the system must allow a hard override by management or block the check-in.
3. **Deposit Hold:** The system sends an API call to the payment gateway to place a **$250 CAD Pre-Authorization Hold** on the credit card.
4. Agent hands over keys. System updates Reservation state to `In-House` and Room state to `Occupied`.

### Phase 3: The Stay & Night Audit
1. At a scheduled time (e.g., 2:00 AM local time), the automated Night Audit runs.
2. The system iterates through all `In-House` reservations.
3. It posts the nightly room rate and calculates/adds the appropriate daily taxes to each guest's `Folio`.

### Phase 4: Check-out (Strictly by 11:00 AM)
1. Guest requests check-out.
2. Agent inspects the `Folio`.
    * *Scenario A (Clean stay):* Balance is $0.00. Agent clicks "Check-out". The $250 CAD hold is released via the payment gateway.
    * *Scenario B (Violation):* Housekeeping reports smoke. Agent adds a "$250 Cannabis Cleaning Fine" to the Folio. The system captures the funds from the pre-authorized hold to settle the balance.
3. System updates Reservation to `Checked-Out` and Room to `Dirty`.
4. Final zero-balance invoice is emailed to the guest.

---

## 4. Attention Points & Architectural Constraints

These are high-risk areas that developers must get right to ensure the system is viable in Canada.

*   **Financial Precision & Taxes:** Never use floating-point numbers for currency (`float` or `double`). Use `Decimal`, `BigDecimal`, or integer cents (e.g., $10.50 stored as `1050`) to avoid rounding errors. The tax engine must be modular, as rates change based on province and municipal laws.
*   **Idempotent API Operations:** When a channel manager (like SiteMinder) pushes a booking, they might send the webhook three times if the network lags. Your endpoint must use an Idempotency Key (usually the OTA Booking ID) to ensure the guest isn't booked three times.
*   **Timezone Handling (CRITICAL):** All timestamps in the database must be saved in **UTC**. Conversion to the local timezone (e.g., `America/Halifax` for Bedford, NS) must happen at the application/presentation layer. The Night Audit cron job must be timezone-aware.
*   **Strict Security & PIPEDA:** Do not build your own card storage. Use Stripe/Adyen Elements so card data never touches your server backend (PCI-DSS compliance). Include a "Forget Me" button in the Guest Profile module to scrub PII for PIPEDA compliance, leaving only anonymous demographic data attached to financial records.
*   **Concurrency Control:** Use Optimistic Locking on the `RoomInventory` table. If two users try to book the last "Double Queen" room at the exact same millisecond, the database must reject one transaction to prevent overbooking.

---

## 5. Multi-Property Operation

The business operates two locations. Each one is a `Property` in the system.

| Property | Location | Front-desk hours |
|---|---|---|
| Bedford | Bedford, Nova Scotia | 24 hours |
| Timberlea | Timberlea, Nova Scotia | 8:00 AM to 12:00 AM (midnight), daily |

### Rules
*   **Scoping:** RoomTypes, Rooms, `RoomInventory`, Reservations, Folios and Night Audit runs are always scoped to one property. Availability and overbooking prevention are evaluated per property.
*   **Booking:** The public booking flow starts with the choice of location, then dates (see Phase 1).
*   **Night Audit:** Runs separately for each property, at the cutoff time in that property's local timezone.
*   **Taxes:** Taxes are calculated according to the tax jurisdiction of the property where the stay happens.
*   **Front-desk hours:** Each property stores its own front-desk hours; the Timberlea front desk is closed between 12:00 AM and 8:00 AM.

### To be defined by the project owner
*   Whether staff users are assigned to one property, to both, or have access according to role (e.g., General Manager sees both).
*   Whether guest profiles are shared across properties.
*   Whether reports are per property only or also consolidated across properties.
*   Handling of arrivals and walk-ins at Timberlea while its front desk is closed.
*   Whether each property is a separate listing in the channel manager/OTAs (the inspiration business uses a separate booking engine ID per location).
*   Whether policies (check-in/check-out times, Age 21+, deposit amount, fines) are identical for both properties or configurable per property.

---

## 6. Group, Corporate & Extended-Stay Requests

These stays are not booked instantly through the booking widget. They start as a **request** submitted through a public form and handled by staff.

### Request form
| Field | Required |
|---|---|
| Name | Yes |
| Email | Yes |
| Phone | No |
| Property: Bedford, Timberlea or Both | Yes |
| Request type: Group Booking, Extended Stay or Corporate Accommodation | Yes |
| Message | Yes |

### Corporate / Organization Discount Application
Companies and organizations that book accommodation regularly can apply for a corporate/organization discount.

### Rules
*   The form is available in English and French.
*   Personal information submitted is handled according to the privacy policy and PIPEDA.
*   Public forms must be protected against spam submissions.

### To be defined by the project owner
*   Which role handles the requests, the request statuses and the expected response time.
*   What qualifies as a group (number of rooms/guests) and as an extended stay (minimum nights).
*   Corporate discount application fields, approval process and discount rules.
*   How an approved request becomes reservation(s), and whether groups/corporate accounts have a shared (master) folio or direct billing.
*   Pricing, deposit and cancellation rules for group, corporate and extended stays.

---

## 7. Supported Languages

*   The system supports **only English (EN) and French (FR)**.
*   This applies to the guest-facing experience (booking widget, request forms, emails, invoices) **and** to the staff interface.
*   Each user (guest or staff member) uses the system in one of these two languages; no other language is supported.
