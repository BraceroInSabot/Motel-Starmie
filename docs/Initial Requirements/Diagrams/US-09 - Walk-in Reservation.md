# US-09 — Walk-in Reservation: Diagrams

> Source: `US-09-walk-in-reservation.md`. Related: US-05 (T&C at the desk), US-06 (booking rules), US-12 and US-13 (check-in), US-15 (cash payment), US-20 (guest profile).

## Business rules reflected

| Rule (US-09) | Where it appears |
|---|---|
| Same availability, concurrency and tax rules | Reuses `QuoteStayService` and `InventoryRepository` (US-06) |
| Created for the agent's property | `property_id` taken from the session (US-01), not from the request |
| Walk-in starts today (property local date) and continues to check-in | `StayDates.check_in == today`, response links to check-in |
| Same T&C acceptance, recorded by the agent | `AcceptTermsUseCase` with `FRONT_DESK` (US-05) |
| Name, email (required), phone, PIPEDA consent | `DeskBookingCommand` validation |
| Full stay paid at creation: card via Stripe fields on the desk screen, or cash recorded in the folio | `PaymentMethodChoice` = `CARD` or `CASH` |
| Card tokenization only for card payers | No Stripe customer created for cash payers |
| Walk-ins start Confirmed | `channel = WALK_IN`, `status = CONFIRMED` |
| Phone bookings for future dates: same form, card only, start Unconfirmed | `channel = PHONE`, `status = UNCONFIRMED`, cash refused |
| Arrival before 4:00 PM needs early check-in approval (US-12) | Flag on the reservation, handled at check-in |
| Keyboard: Tab/Shift+Tab fixed order, arrows + Enter for room type, Ctrl+Enter submits | `WalkInForm` front-end component |

---

## 1. Class Diagram (Clean Architecture)

```mermaid
classDiagram
    direction LR

    namespace Domain {
        class Channel {
            <<Enumeration · US-06>>
            WALK_IN
            PHONE
        }
        class PaymentMethodChoice {
            <<Enumeration>>
            CARD
            CASH
        }
        class DeskBookingPolicy {
            <<Domain Service>>
            +initial_status(channel) ReservationStatus
            +allowed_payment(channel) set~PaymentMethodChoice~
            +validate_dates(channel, dates, today_local) None
        }
    }

    namespace Application {
        class DeskBookingCommand {
            <<DTO>>
            +Channel channel
            +RoomTypeId room_type_id
            +StayDates dates
            +int guests
            +GuestDetails guest
            +bool pipeda_consent
            +str terms_acceptance_token
            +PaymentMethodChoice payment
            +str payment_method_id
        }
        class CreateDeskBookingUseCase {
            +execute(staff, cmd) ReservationCreated
        }
        class QuoteStayService {
            <<US-03, US-04>>
        }
        class InventoryRepository {
            <<Port · US-06>>
        }
        class GuestProfileService {
            <<US-20>>
        }
        class PaymentGateway {
            <<Port · US-06>>
        }
        class FolioService {
            <<US-15>>
            +post_payment(folio, type, amount, staff) None
        }
    }

    namespace Infrastructure {
        class StripePaymentGateway
    }

    namespace Interface {
        class DeskBookingView {
            <<REST · FRONT_DESK_WORK>>
            POST /api/v1/desk-bookings
        }
    }

    namespace FrontEnd {
        class WalkInForm {
            <<React · MantineUI>>
            +fixed tab order
            +room type list with arrows and Enter
            +Ctrl+Enter submits
            +Stripe card fields when CARD
        }
    }

    DeskBookingPolicy ..> Channel
    DeskBookingPolicy ..> PaymentMethodChoice
    CreateDeskBookingUseCase ..> DeskBookingCommand
    CreateDeskBookingUseCase --> DeskBookingPolicy
    CreateDeskBookingUseCase --> QuoteStayService
    CreateDeskBookingUseCase --> InventoryRepository
    CreateDeskBookingUseCase --> GuestProfileService
    CreateDeskBookingUseCase --> PaymentGateway
    CreateDeskBookingUseCase --> FolioService
    StripePaymentGateway ..|> PaymentGateway
    DeskBookingView --> CreateDeskBookingUseCase
    WalkInForm ..> DeskBookingView : POST
```

### Design notes
- **`DeskBookingPolicy`:**
  - `WALK_IN`: check-in must be today (property local date); status `CONFIRMED`; payment `CARD` or `CASH`.
  - `PHONE`: check-in after today, within the US-03 booking window; status `UNCONFIRMED`; payment `CARD` only.
- **Card payment:** the Stripe card fields run on the desk screen, so card data never reaches the backend; the charge, the kept card and the rollback rules are the same as US-06.
- **Cash payment:** no Stripe call; the agent's cash payment is posted to the folio as a `CASH` payment (debit cash, credit guest receivable, US-15) in the same transaction as the reservation.
- **Next step:** for a walk-in, the response returns the reservation id and the front end opens the check-in screen (US-12, US-13). If the local time is before 4:00 PM, the dashboard flag "early check-in approval needed" applies (US-10, US-12).
- **Permission:** `FRONT_DESK_WORK` (Front Desk Agent or GM).

---

## 2. ER Diagram

```mermaid
erDiagram
    RESERVATION ||--|| FOLIO : "has"
    FOLIO ||--o{ LEDGER_ENTRY : "contains"
    RESERVATION ||--o| TERMS_ACCEPTANCE : "evidence"
    STAFF_USER ||--o{ RESERVATION : "creates at desk"

    RESERVATION {
        uuid id PK "US-06"
        uuid property_id FK "agent's property"
        varchar channel "WALK_IN or PHONE"
        varchar status "WALK_IN CONFIRMED, PHONE UNCONFIRMED"
        date check_in_date "today for WALK_IN"
        varchar stripe_payment_method_id "null for cash payers"
        uuid created_by_staff_id FK
    }
    LEDGER_ENTRY {
        uuid id PK "US-15"
        uuid folio_id FK
        varchar entry_type "CASH or STRIPE_CARD payment"
        numeric amount
        char currency
        uuid posted_by FK
    }
    TERMS_ACCEPTANCE {
        uuid id PK "US-05"
        varchar channel "FRONT_DESK"
        uuid recorded_by_staff_id FK
    }
    FOLIO {
        uuid id PK "US-15"
    }
    STAFF_USER {
        uuid id PK "US-01"
    }
```

---

## 3. Event Flow

### 3.1 Walk-in by card or cash, and phone booking — Scenarios 1 to 4

```mermaid
sequenceDiagram
    autonumber
    actor FDA as Front Desk Agent
    participant Form as WalkInForm
    participant View as DeskBookingView
    participant UC as CreateDeskBookingUseCase
    participant Inv as InventoryRepository
    participant Pay as PaymentGateway
    participant Folio as FolioService

    FDA->>Form: guest data, T&C accepted for the guest, room type, payment
    Form->>View: POST (Ctrl+Enter)
    View->>UC: execute(staff, cmd)
    UC->>Inv: reserve each night (version check)
    alt no availability
        View-->>FDA: 409 no rooms available
    else reserved
        alt walk-in paid in cash
            UC->>Folio: post CASH payment (full stay)
            UC->>UC: reservation WALK_IN, CONFIRMED
            View-->>FDA: 201, continue to check-in
        else walk-in paid by card
            UC->>Pay: charge(full stay, idempotency key)
            UC->>UC: reservation WALK_IN, CONFIRMED, STRIPE_CARD payment
            View-->>FDA: 201, continue to check-in
        else phone booking, future dates
            UC->>Pay: charge(full stay, idempotency key)
            UC->>UC: reservation PHONE, UNCONFIRMED (as US-06)
            View-->>FDA: 201, waiting for confirmation
        end
    end
```

### 3.2 Domain events

| Event | Raised when | Consumers |
|---|---|---|
| `ReservationCreated` (channel `WALK_IN` or `PHONE`) | Desk booking committed | Front desk dashboard (US-10); "booking received" email for phone bookings (US-06) |
| `PaymentReceived` | Card charge or cash posted | Folio (US-15) |
