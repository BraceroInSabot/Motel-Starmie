# US-06 — Reservation Creation with Secure Card Tokenization: Diagrams

> Source: `US-06-reservation-creation-with-secure-card-tokenization.md`. Related: US-03 (quote), US-04 (taxes), US-05 (T&C), US-11 (lifecycle and fees), US-13 (deposit hold on the kept card), US-15 (folio), US-20 (guest profile).

## Business rules reflected

| Rule (US-06) | Where it appears |
|---|---|
| Card data never reaches the backend; Stripe hosted elements | Stripe Elements in the widget; backend receives a PaymentMethod id |
| Gateway is Stripe | `PaymentGateway` port, `StripePaymentGateway` adapter |
| Guest provides full name, email, phone and PIPEDA consent; no consent, no booking | `CreateReservationCommand`, `GuestProfileService` (US-20) |
| Full stay (nights + taxes) charged at booking, recorded as a payment in the folio | `PaymentGateway.charge()`, `Folio.post_payment(STRIPE_CARD)` |
| Declined charge: no reservation, no room reserved; guest can try another card | Charge happens before commit; transaction rolled back (Scenario 3) |
| Stripe keeps the card; only its reference is stored; used for the deposit at check-in | `RESERVATION.stripe_payment_method_id`, `GUEST_PROFILE.stripe_customer_id` |
| Direct booking starts Unconfirmed; staff confirm | `Reservation.status = UNCONFIRMED`, `ConfirmReservationUseCase` |
| Unconfirmed bookings reserve the room, show on the dashboard, never expire | `ROOM_INVENTORY.reserved_count`, no expiry job |
| Staff rejection: canceled, full automatic refund, no fee | `RejectReservationUseCase` |
| Guest cancellation: refund minus the cancellation fee | US-11 (`CancelReservationUseCase`) |
| Two emails in EN/FR: "booking received", "booking confirmed" | `Notifier` after commit |
| Optimistic locking on RoomInventory | `RoomInventory.version`, Scenario 4 |

---

## 1. Class Diagram (Clean Architecture)

```mermaid
classDiagram
    direction LR

    namespace Domain {
        class Reservation {
            <<Aggregate Root>>
            +ReservationId id
            +PropertyId property_id
            +GuestId guest_id
            +RoomTypeId room_type_id
            +ConfirmationCode code
            +Channel channel
            +ReservationStatus status
            +StayDates dates
            +int guests
            +Language language
            +str stripe_payment_method_id
            +confirm(actor) None
            +cancel(actor, reason) None
        }
        class Channel {
            <<Enumeration>>
            DIRECT
            WALK_IN
            PHONE
            OTA
        }
        class ReservationStatus {
            <<Enumeration · US-11>>
            UNCONFIRMED
            CONFIRMED
            IN_HOUSE
            CHECKED_OUT
            CANCELED
            NO_SHOW
        }
        class RoomInventory {
            <<Aggregate Root>>
            +RoomTypeId room_type_id
            +date stay_date
            +int reserved_count
            +int version
            +reserve(sellable_rooms) None
            +release() None
        }
        class StayQuote {
            <<Value Object>>
            +list~NightPrice~ nights
            +list~TaxLine~ taxes
            +Money total
        }
        class Folio {
            <<Aggregate Root · US-15>>
            +post_room_prepayment(payment) None
        }
        class ReservationRepository {
            <<Port>>
        }
        class InventoryRepository {
            <<Port>>
            +lock_nights(room_type_id, nights) list~RoomInventory~
            +save_all(rows) None
        }
    }

    namespace Application {
        class CreateReservationUseCase {
            +execute(cmd) ReservationCreated
        }
        class CreateReservationCommand {
            <<DTO>>
            +PropertyId property_id
            +RoomTypeId room_type_id
            +StayDates dates
            +int guests
            +GuestDetails guest
            +bool pipeda_consent
            +str payment_method_id
            +str terms_acceptance_token
        }
        class ConfirmReservationUseCase {
            +execute(reservation_id, staff) None
        }
        class RejectReservationUseCase {
            +execute(reservation_id, staff) None
        }
        class QuoteStayService {
            <<Application Service · US-03, US-04>>
            +quote(property, room_type, dates) StayQuote
        }
        class GuestProfileService {
            <<Application Service · US-20>>
            +register_or_update(details, consent, source) GuestProfile
        }
        class PaymentGateway {
            <<Port>>
            +ensure_customer(guest) str
            +charge(customer, payment_method, amount, idempotency_key) ChargeResult
            +refund(charge_id, amount, idempotency_key) RefundResult
        }
        class Notifier {
            <<Port>>
            +booking_received(reservation, language) None
            +booking_confirmed(reservation, language) None
        }
        class UnitOfWork {
            <<Port>>
        }
    }

    namespace Infrastructure {
        class StripePaymentGateway
        class EmailNotifier
        class DjangoReservationRepository
        class DjangoInventoryRepository
        class DjangoUnitOfWork
    }

    namespace Interface {
        class ReservationViews {
            <<REST>>
            POST /api/v1/reservations
            POST /api/v1/reservations/id/confirm
            POST /api/v1/reservations/id/reject
        }
    }

    Reservation --> Channel
    Reservation --> ReservationStatus
    CreateReservationUseCase ..> CreateReservationCommand
    CreateReservationUseCase --> QuoteStayService
    CreateReservationUseCase --> GuestProfileService
    CreateReservationUseCase --> InventoryRepository
    CreateReservationUseCase --> ReservationRepository
    CreateReservationUseCase --> PaymentGateway
    CreateReservationUseCase --> Notifier
    CreateReservationUseCase --> UnitOfWork
    CreateReservationUseCase ..> Folio
    ConfirmReservationUseCase --> Notifier
    RejectReservationUseCase --> PaymentGateway
    InventoryRepository ..> RoomInventory
    QuoteStayService ..> StayQuote
    StripePaymentGateway ..|> PaymentGateway
    EmailNotifier ..|> Notifier
    DjangoReservationRepository ..|> ReservationRepository
    DjangoInventoryRepository ..|> InventoryRepository
    DjangoUnitOfWork ..|> UnitOfWork
    ReservationViews --> CreateReservationUseCase
    ReservationViews --> ConfirmReservationUseCase
    ReservationViews --> RejectReservationUseCase
```

### Design notes
- **Order inside `CreateReservationUseCase`** (one database transaction):
  1. check the T&C acceptance token (US-05) and the PIPEDA consent;
  2. quote the stay again on the server (never trust the client total);
  3. reserve every night in `ROOM_INVENTORY` with optimistic locking (`UPDATE ... SET reserved_count = reserved_count + 1, version = version + 1 WHERE id = ? AND version = ?`); a lost update raises `RoomNoLongerAvailable` (Scenario 4);
  4. register or update the guest profile (US-20) and its Stripe customer;
  5. charge the full total through Stripe with an idempotency key; a decline raises `PaymentDeclined` and the transaction rolls back, so no reservation and no reserved night exist (Scenario 3);
  6. create the reservation as `UNCONFIRMED` and its folio, and post the payment as a `STRIPE_CARD` credit; room charges are **not** posted yet, because the Night Audit posts each night (US-14);
  7. after commit, send "booking received".
- **If the commit fails after a successful charge**, an after-rollback handler refunds the charge with the same idempotency key, so the guest is never charged without a reservation.
- **Card kept by Stripe:** the charge uses `setup_future_usage = off_session`, so the same PaymentMethod can be used for the deposit hold at check-in (US-13), extra charges at check-out (US-17) and late fines (US-16).
- **Confirm / reject** need the `FRONT_DESK_WORK` permission (Front Desk Agent or GM). Reject = cancel with reason `MOTEL_DECISION`, full refund, no fee, nights released.
- **Tokenization failure (Scenario 2)** happens in Stripe Elements before any call to the backend.

---

## 2. ER Diagram

```mermaid
erDiagram
    PROPERTY ||--o{ RESERVATION : "receives"
    GUEST_PROFILE ||--o{ RESERVATION : "books"
    ROOM_TYPE ||--o{ RESERVATION : "booked as"
    RESERVATION ||--|{ RESERVATION_NIGHT : "covers"
    ROOM_INVENTORY ||--o{ RESERVATION_NIGHT : "consumed by"
    RESERVATION ||--|| FOLIO : "has"
    RESERVATION ||--o{ RESERVATION_STATUS_HISTORY : "records"

    RESERVATION {
        uuid id PK
        uuid property_id FK
        uuid guest_id FK
        uuid room_type_id FK
        uuid room_id FK "assigned at check-in, US-13"
        varchar confirmation_code UK
        varchar channel "DIRECT, WALK_IN, PHONE, OTA"
        varchar status "starts UNCONFIRMED for DIRECT"
        date check_in_date
        date check_out_date
        smallint guests
        char language "EN or FR"
        varchar stripe_payment_method_id "reference only"
        varchar stripe_charge_id
        varchar cancel_token_hash "US-11"
        int version
        timestamptz created_at
    }
    RESERVATION_NIGHT {
        uuid reservation_id PK, FK
        date stay_date PK
        uuid room_inventory_id FK
        numeric nightly_rate "quoted, before taxes"
        char currency
    }
    ROOM_INVENTORY {
        uuid id PK
        uuid room_type_id FK
        date stay_date "UK with room_type_id"
        int reserved_count
        int version "optimistic lock"
    }
    FOLIO {
        uuid id PK "US-15"
        uuid reservation_id FK, UK
        char currency "CAD"
    }
    RESERVATION_STATUS_HISTORY {
        uuid id PK "US-11"
        uuid reservation_id FK
        varchar from_status
        varchar to_status
        varchar actor_type "GUEST, STAFF, SYSTEM"
        uuid actor_id
        timestamptz changed_at
    }
    GUEST_PROFILE {
        uuid id PK "US-20"
        varchar stripe_customer_id
    }
```

---

## 3. Event Flow

### 3.1 Successful booking, decline and concurrency — Scenarios 1, 3 and 4

```mermaid
sequenceDiagram
    autonumber
    actor Guest
    participant Elements as Stripe Elements
    participant View as ReservationViews<br/>POST /api/v1/reservations
    participant UC as CreateReservationUseCase
    participant Inv as InventoryRepository
    participant Pay as PaymentGateway
    participant DB as UnitOfWork
    participant Mail as Notifier

    Guest->>Elements: card details
    Elements-->>Guest: payment_method_id (card never reaches the backend)
    Guest->>View: room type, dates, guest details, consent, T&C token, payment_method_id
    View->>UC: execute(cmd)
    UC->>DB: begin
    UC->>Inv: reserve each night (version check)
    alt another booking took the last room
        Inv-->>UC: RoomNoLongerAvailable
        UC->>DB: rollback
        View-->>Guest: 409 room no longer available
    else nights reserved
        UC->>Pay: charge(full stay + taxes, idempotency key)
        alt charge declined
            Pay-->>UC: declined
            UC->>DB: rollback (no reservation, no room reserved)
            View-->>Guest: 402 decline message, try another card
        else charge succeeded
            UC->>DB: reservation UNCONFIRMED, folio, STRIPE_CARD payment
            UC->>DB: commit
            DB-->>Mail: after commit: booking received (EN/FR)
            View-->>Guest: 201 Created, confirmation code
        end
    end
```

### 3.2 Staff confirms or rejects — Scenarios 5 and 6

```mermaid
sequenceDiagram
    autonumber
    actor FDA as Front Desk Agent or GM
    participant View as ReservationViews
    participant Confirm as ConfirmReservationUseCase
    participant Reject as RejectReservationUseCase
    participant Pay as PaymentGateway
    participant Mail as Notifier

    alt confirm
        FDA->>View: POST /reservations/{id}/confirm
        View->>Confirm: execute(id, staff)
        Confirm-->>Mail: after commit: booking confirmed (EN/FR)
        View-->>FDA: 200 Confirmed
    else reject
        FDA->>View: POST /reservations/{id}/reject
        View->>Reject: execute(id, staff)
        Reject->>Reject: status CANCELED, reason MOTEL_DECISION, nights released
        Reject->>Pay: refund(full amount, no fee)
        View-->>FDA: 200 Canceled and refunded
    end
```

### 3.3 Domain events

| Event | Raised when | Consumers |
|---|---|---|
| `ReservationCreated` | Booking committed | "Booking received" email, front desk dashboard (US-10) |
| `PaymentReceived` | Stripe charge posted to the folio | Folio (US-15) |
| `ReservationConfirmed` | Staff confirms | "Booking confirmed" email, dashboard |
| `ReservationCanceled` | Staff rejects (no fee) | Refund (US-11), inventory release, dashboard |
