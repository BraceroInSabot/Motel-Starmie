# Starmie Motel PMS: Development Guide

> **Source of truth:** the user stories in `docs/Initial Requirements/` (US-01 to US-24). This document summarizes them. If anything here differs from a user story, the user story wins.

**System Description:** A cloud-native Property Management System (PMS) for high-turnover Canadian motels operating **two properties** in Nova Scotia: **Bedford** and **Timberlea**. The system handles online, walk-in, phone and (mocked) OTA bookings, front-desk operations, a double-entry folio ledger with Canadian taxes (HST and the Halifax Marketing Levy), housekeeping workflows, and financial and occupancy reports, while enforcing strict property policies. Guest-facing content is available in **English and French**. Payments go through **Stripe**.

---

## 1. Personas and System Processes

### Staff roles (US-01)
| Role | Main responsibilities |
|---|---|
| **Front Desk Agent** | Reservations, walk-ins, phone bookings, check-in, check-out, folios, fines, cash deposits, early check-in approval, guest profiles and "Forget Me". Uses a fast, keyboard-friendly dashboard (US-10). Works at one property. |
| **General Manager / Owner** | Everything a Front Desk Agent can do, plus all settings (properties, rooms, rates, taxes, deposit, fines, no-show and fee policy, OTA mapping, staff accounts, permissions), the age-policy override, corrections (voids and refunds), and all reports. Has access to every property. |
| **Housekeeper** | Mobile/tablet housekeeping board, cleaning actions, stayover cleaning, violation reports with photos. Never has access to financial data. Works at one property. |

* **Head Housekeeper** is not a role. It is a **privilege** the General Manager can grant to any Housekeeper. It allows verifying cleaned rooms and moving rooms to Unavailable or Maintenance.
* The **Guest** uses the public booking widget (EN/FR) and the cancellation link in their emails. Guests have no login.

### Automated system processes
* **Night Audit** (US-14): posts each night's room rate and taxes at **2:00 AM** local time, for each property. It is not a staff role.
* **No-show check** (US-11): runs every 15 minutes and marks Confirmed reservations as No-Show after the property's no-show deadline.

### Authentication and permissions (US-01)
* Login with a unique, case-insensitive **email address**. Passwords: at least 12 characters, common and leaked passwords rejected.
* **10 consecutive failed attempts** lock the account for **15 minutes** (the General Manager can unlock it earlier). Sessions expire **12 hours** after login.
* The General Manager creates staff accounts with a temporary password that must be changed at the first login. The first General Manager account is created by the system's seed data at installation.
* Forgotten passwords: a single-use email reset link valid for 1 hour, or a new temporary password issued by the General Manager.
* Each staff member uses the staff screens in **English or French**, saved on their account (default English, US-24).
* Each role has a permission matrix that the General Manager can modify (default matrix in US-01). Housekeepers can **never** receive financial access, and the General Manager cannot remove their own access to settings and permissions.

---

## 2. Domain Model

### Core entities
* **Property** (US-02): name, timezone (`America/Halifax`), base currency (CAD), tax province and front-desk hours. Bedford: 24 hours. Timberlea: 8:00 AM to 12:00 AM.
* **RoomType** (US-02): belongs to one property. Name and description (EN/FR), maximum number of guests, bed configuration, amenities (refrigerator, microwave, coffee maker, TV, Wi-Fi), optional photos, a nightly **base rate** and an optional **weekend rate** (Friday and Saturday nights, US-03).
* **Room** (US-02): room number (unique per property), room type, optional note. New rooms start **Available**. Rooms and room types are deactivated, never deleted.
* **GuestProfile** (US-20): full name, email, phone (all encrypted), preferred language (EN/FR) and the PIPEDA consent (flag, date/time, source: booking website, front desk or OTA). One profile per email address, shared by both properties.
* **Reservation** (US-06, US-11): belongs to one property and one guest profile. Channel: direct, walk-in, phone or OTA.
* **Folio** (US-15): exactly one per reservation. A double-entry ledger of charges and payments.
* **Deposit** (US-13): a Stripe pre-authorization hold, or a cash deposit confirmed with the agent's password.
* **Terms & Conditions** (US-05): per property, EN/FR, versioned. Acceptances are stored as evidence.
* **Fine type and Violation report** (US-16): fines catalog per property; reports from Housekeepers with photo evidence.
* **Tax rate** (US-04): tax name, area, rate and effective date, maintained by the General Manager.
* **Channel mapping** (US-08): links a property's room type to a mock OTA channel room code.

### Reservation state machine (US-11)
| From | To | Triggered by |
|---|---|---|
| Unconfirmed | Confirmed | Front Desk Agent or General Manager |
| Unconfirmed | Canceled | Guest (cancellation link), Front Desk Agent or General Manager |
| Confirmed | Canceled | Guest (cancellation link), Front Desk Agent or General Manager |
| Confirmed | In-House | Check-in (US-13) |
| Confirmed | No-Show | System (no-show deadline) |
| In-House | Checked-Out | Check-out (US-17) |

* Direct and phone bookings start **Unconfirmed**. Walk-ins and OTA bookings start **Confirmed**.
* **In-House reservations cannot be canceled.** A guest who leaves early is checked out, and unused prepaid nights are refunded.

### Room state machine (US-19)
| From | To | Triggered by |
|---|---|---|
| Available | Occupied | Check-in |
| Occupied | Dirty | Check-out |
| Occupied | Dirty | Stayover cleaning request (Housekeeper, General Manager or Front Desk Agent) |
| Dirty (guest still In-House) | Occupied | Housekeeper marks the room as CLEANED |
| Dirty (after check-out) | Cleaning | Any Housekeeper |
| Cleaning | Available | Head Housekeeper verification |
| Available, Dirty (after check-out) or Cleaning | Unavailable or Maintenance | Head Housekeeper or General Manager, with a reason |
| Unavailable or Maintenance | Dirty | Head Housekeeper or General Manager |

* A guest can only be checked into an **Available** room. A room cannot go out of service while a guest is In-House.
* **Maintenance** is for repairs; **Unavailable** is for any other reason.

---

## 3. Guest Lifecycle

### Phase 1: Booking
**Direct booking (US-03, US-05, US-06):**
1. The guest selects the property, then the dates (1 to 5 **nights**, from the current day up to 365 days ahead) and the number of guests.
2. The system lists the room types that are available for every night and fit the number of guests, with each night's price, the taxes and the total.
3. The guest accepts the property's Terms & Conditions and gives PIPEDA consent.
4. Stripe tokenizes the card (card data never reaches the backend) and the **full stay amount is charged at booking**.
5. The reservation is created as **Unconfirmed**, and the guest receives a "booking received" email. A staff member then confirms it ("booking confirmed" email) or rejects it (full refund, no fee). Unconfirmed bookings reserve the room and never expire.

**Walk-in and phone bookings (US-09):** created by the Front Desk Agent at their own property. Walk-ins start today, start Confirmed and pay the full stay by card (Stripe fields on the desk screen) or in cash. Phone bookings for future dates are paid by card and start Unconfirmed.

**OTA bookings (US-07, US-08):** mocked. A mock OTA simulator sends signed (HMAC) webhooks to the real endpoint. The OTA Booking ID is the idempotency key. Bookings start Confirmed, are recorded as "OTA prepaid" (no Stripe charge) and receive no email from the system. Unmapped room codes and bookings without availability are rejected and logged. Modifications and cancellations from the OTA are out of scope for V1.

### Phase 2: Check-in (US-12, US-13)
1. **ID verification:** only the registering guest shows a driver's licence, passport or provincial/territorial photo ID. Under 21: blocked unless the **General Manager** approves an override (required justification, audit record) from their own login. No ID data is stored.
2. **Early check-in:** check-in starts at 4:00 PM. Before that, a Front Desk Agent can approve it (no fee) if an Available room of the booked type exists.
3. **Deposit:** a Stripe hold for the property's deposit amount (default **$250 CAD**) on the card kept since booking, or on a card entered at check-in (which Stripe then keeps as well), or a **cash deposit** confirmed with the agent's password.
4. **Room assignment:** the agent chooses an Available room of the booked room type.
5. The reservation becomes **In-House** and the room **Occupied**.

### Phase 3: The stay (US-14, US-16, US-19)
* At **2:00 AM** local time, the Night Audit posts the previous night's room rate and taxes to each In-House folio. Each night is charged once; missed nights are caught up at the next run.
* Guests can ask for stayover cleaning (Occupied → Dirty → Occupied).
* Housekeepers report violations with 1 to 5 photos. A Front Desk Agent posts the fine or dismisses the report with a reason.

### Phase 4: Check-out (US-17), strictly by 11:00 AM
When "Check-out" is clicked:
1. Capture unpaid fines from the card hold, or deduct them from the cash deposit.
2. Charge any remaining balance to the card kept by Stripe.
3. Refund unused prepaid nights if the guest leaves early, by the payment method (Stripe or cash). OTA bookings get no refund in the system: an OTA prepaid adjustment brings the balance to zero.
4. Check that the folio balance is **$0.00** (otherwise the guest pays at the desk; check-out stays blocked).
5. Release the rest of the card hold, or return the rest of the cash deposit.
6. Reservation → Checked-Out, room → Dirty.
7. Email the final invoice (PDF in the guest's language, numbered per property as `BED-000001` / `TIM-000001`, with the company's legal name and GST/HST number).

A guest still In-House after 11:00 AM is flagged as a late check-out (no fee). Within **7 days** after check-out, the General Manager can still post a fine, charged to the card kept by Stripe (from booking or check-in). Guests with no card kept by Stripe cannot be fined after check-out.

### Phase 5: Cancellation and No-Show (US-11)
* Guests cancel through the secure link in their emails. Staff cancellations are marked as the guest's request (fee rules apply) or the motel's decision (no fee).
* The cancellation fee (optional fixed amount per property) applies only within **X hours** before check-in (X set per property; 0 = always).
* **No-Show deadline:** midnight at the end of the arrival day + the property's grace period (default 60 minutes, i.e., 1:00 AM).
* Refunds are made minus the applicable fee, by the method the guest used to pay: card payments through Stripe automatically; cash payments in cash at the desk (if the guest is absent, the cash refund stays owed in the Held Funds report). OTA bookings get no refund or fee in the system.

---

## 4. Money and Taxes (US-04, US-15)

* **Default rates** (editable by the General Manager): **HST 14%** (Nova Scotia, effective April 1, 2025) and the **Halifax Marketing Levy 3%** on room nights.
* The levy is calculated on the room rate; HST is calculated on the room rate **plus** the rounded levy. Example: $100.00 → levy $3.00 + HST $14.42 = **$117.42**.
* Each tax is calculated per line and rounded to the cent, with halves rounded up. The rate is the one in force on the local date of the night.
* **Only room nights are taxed.** Fines, cancellation fees and no-show fees are not taxed.
* **Charge types:** room night, taxes, fines, cancellation fee, no-show fee. **Payment types:** Stripe card, OTA prepaid, OTA prepaid adjustment, cash, deposit captured from a hold, cash deposit received and returned, refunds (Stripe or cash). No other charges can be posted.
* Split payments are allowed. Only the General Manager can void a charge or issue a refund; corrections add a reversing entry with a reason and never edit or delete.

---

## 5. Architectural Constraints

* **Financial precision:** never use `float`/`double` for money. Use `Decimal` or integer cents, and always store the value with its currency.
* **Idempotency:** OTA webhooks use the OTA Booking ID as the idempotency key; Stripe calls use idempotency keys.
* **Timezones:** all timestamps are stored in **UTC** and converted to `America/Halifax` at the presentation layer. Scheduled jobs (cron) are timezone-aware; at the spring-forward change the Night Audit runs at 3:00 AM, and at the fall-back change it runs once.
* **Security and PIPEDA:** Stripe hosted elements (PCI-DSS); guest PII encrypted at rest; "Forget Me" (US-21) erases PII and the Stripe customer record while keeping financial records and issued invoices.
* **Concurrency:** optimistic locking on `RoomInventory` prevents overbooking.
* **Performance:** every API request responds in **1.5 seconds or less for 95%** of requests (exports and external services excluded).
* **Real-time:** the housekeeping board and room states on the front desk dashboard are pushed with WebSockets (Django Channels) using RabbitMQ.
* **Night Audit failures:** reservations that fail go to an exceptions list; a failed run is retried every 15 minutes up to 3 times, then the developer is emailed (address in an environment variable). Errors go to the application logs and every run is stored in the database.

---

## 6. Multi-Property Operation

| Property | Location | Front-desk hours |
|---|---|---|
| Bedford | Bedford, Nova Scotia | 24 hours |
| Timberlea | Timberlea, Nova Scotia | 8:00 AM to 12:00 AM (midnight), daily |

* Room types, rooms, inventory, reservations, folios, Night Audit runs, Terms & Conditions, deposit amount, fines, no-show grace period and fees are all **per property**.
* Staff work at one property; the General Manager accesses all properties.
* Guest profiles are **shared** by both properties.
* The company's legal name and GST/HST registration number are set once and apply to both properties' invoices; each property has its own invoice prefix (BED, TIM).
* Each property is a separate listing on each OTA channel.
* Reports are generated **per property**; there is no combined report in V1.

---

## 7. Reports (US-14, US-22, US-23)

All reports: header (property, report name, date or period, generated at and by), summary totals, a sortable and filterable table, and **PDF** (WeasyPrint) and **CSV** export.

* **Night Audit report:** run status and times, reservations charged, room revenue, taxes per type, total posted, a line per reservation and an exceptions list.
* **Tax Summary report:** one line per tax (HST, Marketing Levy) and rate, with taxable amount, tax collected, number of transactions and a monthly breakdown.
* **Held Funds report:** finished stays with a deposit hold not yet released, a failed card refund or a cash refund owed to an absent guest, with "Release now" and "Retry refund" actions (audit logged).
* **Occupancy report:** occupancy % = occupied room-nights ÷ available room-nights × 100, plus **ADR** and **RevPAR**, with daily and room-type breakdowns.
* **Fee dashboard** (US-11): fees applied, with an option to email the guest.

---

## 8. Out of Scope for V1

* Sending availability and rates to OTAs; OTA modifications and cancellations (US-07, US-08).
* Guest self check-out; guests editing their own profile (US-17, US-20).
* Marketing emails (US-20).
* Dynamic pricing (US-23).
* Combined reports across properties (US-22).

---

## 9. Not Yet Covered by a User Story

These items come from earlier versions of this document. They have no user story yet, so they must not be implemented until one is written.

### Group, Corporate & Extended-Stay Requests
* Stays requested through a public form (name, email, phone, property, request type: Group Booking, Extended Stay or Corporate Accommodation, message) and handled by staff.
* Companies that book regularly can apply for a corporate/organization discount.
* Open points: who handles requests, statuses and response time, what qualifies as a group or an extended stay, discount rules, how a request becomes reservations, and pricing, deposit and cancellation rules.
