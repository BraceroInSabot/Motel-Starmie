# US-13 — Deposit Pre-Authorization Hold: Diagrams

> Source: `US-13-deposit-pre-authorization-hold.md`. Related: US-01 (password lockout), US-06 (card kept by Stripe), US-12 (ID and early check-in), US-15 (folio), US-16 and US-17 (fines and check-out), US-19 (room state).

## Business rules reflected

| Rule (US-13) | Where it appears |
|---|---|
| Deposit is a Stripe pre-authorization hold; amount per property set by the GM; default $250 CAD | `PROPERTY.deposit_amount`, `PaymentGateway.authorize_hold()` |
| Order: ID → early approval → deposit → room assignment → confirmation; no deposit before the ID check | `CheckInProcess` guards, flowchart 3.1 |
| Hold on the card kept at booking; guests without a card enter one in Stripe fields or leave cash | `PlaceDepositUseCase` with `saved` or `new` PaymentMethod |
| Declined hold: try another card or take cash; check-in blocked until one succeeds | `DepositDeclined`, Scenario 2 |
| Cash deposit for the property's amount, confirmed with the agent's own password, recorded in the folio | `RecordCashDepositUseCase`, `CASH_DEPOSIT_RECEIVED` entry |
| Failed password confirmation counts toward the US-01 lockout | `StaffUser.register_failed_login()` |
| At check-out the cash deposit is returned in cash minus fines, recorded in the folio | US-17, `CASH_DEPOSIT_RETURNED` entry |
| No hold renewal | No renewal job |
| FDA assigns an Available room of the booked type | `AssignRoomUseCase`, Scenario 4 |
| Check-in sets In-House and Occupied | `CompleteCheckInUseCase`, Scenario 5 |

---

## 1. Class Diagram (Clean Architecture)

```mermaid
classDiagram
    direction LR

    namespace Domain {
        class DepositKind {
            <<Enumeration>>
            CARD_HOLD
            CASH
        }
        class DepositStatus {
            <<Enumeration>>
            HELD
            RELEASE_PENDING
            RELEASED
            CAPTURED
            RETURNED
        }
        class Deposit {
            <<Entity>>
            +DepositId id
            +ReservationId reservation_id
            +DepositKind kind
            +Money amount
            +Money captured
            +DepositStatus status
            +str stripe_payment_intent_id
            +StaffId placed_by
        }
        class CheckInProcess {
            <<Domain Service>>
            +assert_can_take_deposit(reservation) None
            +assert_can_assign_room(reservation) None
            +assert_can_complete(reservation) None
        }
        class Reservation {
            <<Aggregate Root · US-06>>
            +check_in(room) None
        }
        class Room {
            <<Aggregate Root · US-19>>
            +occupy() None
        }
    }

    namespace Application {
        class PlaceDepositUseCase {
            +execute(reservation_id, payment_method_id, agent) Deposit
        }
        class RecordCashDepositUseCase {
            +execute(reservation_id, agent, password) Deposit
        }
        class AssignRoomUseCase {
            +execute(reservation_id, room_id, agent) None
        }
        class CompleteCheckInUseCase {
            +execute(reservation_id, agent) None
        }
        class PaymentGateway {
            <<Port>>
            +authorize_hold(customer, payment_method, amount, key) HoldResult
        }
        class PasswordConfirmation {
            <<US-01>>
            +confirm(agent, password) None
        }
        class FolioService {
            <<US-15>>
        }
        class RealtimePublisher {
            <<Port · US-18>>
        }
    }

    namespace Infrastructure {
        class StripePaymentGateway {
            <<PaymentIntent capture_method manual>>
        }
    }

    namespace Interface {
        class CheckInStepViews {
            <<REST · FRONT_DESK_WORK>>
            POST /api/v1/reservations/id/deposit
            POST /api/v1/reservations/id/cash-deposit
            POST /api/v1/reservations/id/room
            POST /api/v1/reservations/id/check-in
        }
    }

    Deposit --> DepositKind
    Deposit --> DepositStatus
    PlaceDepositUseCase --> CheckInProcess
    PlaceDepositUseCase --> PaymentGateway
    RecordCashDepositUseCase --> CheckInProcess
    RecordCashDepositUseCase --> PasswordConfirmation
    RecordCashDepositUseCase --> FolioService
    AssignRoomUseCase --> CheckInProcess
    CompleteCheckInUseCase --> CheckInProcess
    CompleteCheckInUseCase ..> Reservation
    CompleteCheckInUseCase ..> Room
    CompleteCheckInUseCase --> RealtimePublisher
    StripePaymentGateway ..|> PaymentGateway
    CheckInStepViews --> PlaceDepositUseCase
    CheckInStepViews --> RecordCashDepositUseCase
    CheckInStepViews --> AssignRoomUseCase
    CheckInStepViews --> CompleteCheckInUseCase
```

### Design notes
- **Guards (`CheckInProcess`):** the deposit needs a `PASSED` or `OVERRIDDEN` ID verification and, before 4:00 PM, an early check-in approval (US-12); room assignment needs a `HELD` deposit (card or cash); completion needs an assigned room.
- **Card hold:** a Stripe PaymentIntent with `capture_method = manual` for the property's `deposit_amount`, on the PaymentMethod kept at booking (US-06), or on a new one entered in Stripe fields at check-in (OTA guests, cash walk-ins). A hold is **not** a folio entry; only a capture becomes one (US-16, US-17).
- **Cash deposit:** the agent's password is checked by `PasswordConfirmation`; a wrong password increments the same counter as a failed login and can lock the account (US-01). The deposit posts `CASH_DEPOSIT_RECEIVED` (debit cash, credit cash deposits held, US-15).
- **Room assignment:** the room must be active, `AVAILABLE`, of the booked room type and at the agent's property; the optimistic lock on `ROOM.version` prevents two agents from taking the same room.
- **Completion:** in one transaction, the reservation goes `CONFIRMED → IN_HOUSE` (US-11) and the room `AVAILABLE → OCCUPIED` (US-19); after commit, the room state is pushed to the housekeeping board and dashboard (US-18).

---

## 2. ER Diagram

```mermaid
erDiagram
    PROPERTY ||--o{ RESERVATION : "receives"
    RESERVATION ||--o{ DEPOSIT : "secured by"
    RESERVATION }o--o| ROOM : "assigned"
    DEPOSIT ||--o{ LEDGER_ENTRY : "cash and captures posted as"

    PROPERTY {
        uuid id PK "US-02"
        numeric deposit_amount "default 250.00"
        char deposit_currency "CAD"
    }
    DEPOSIT {
        uuid id PK
        uuid reservation_id FK
        varchar kind "CARD_HOLD or CASH"
        numeric amount
        numeric captured_amount
        char currency
        varchar status "HELD, RELEASE_PENDING, RELEASED, CAPTURED, RETURNED"
        varchar stripe_payment_intent_id "CARD_HOLD only"
        int release_attempts "US-17"
        uuid placed_by FK
        timestamptz placed_at
        timestamptz closed_at
    }
    RESERVATION {
        uuid id PK "US-06"
        uuid room_id FK "set at room assignment"
        timestamptz checked_in_at
        uuid checked_in_by FK
    }
    ROOM {
        uuid id PK "US-02"
        varchar state "AVAILABLE to OCCUPIED"
        int version
    }
    LEDGER_ENTRY {
        uuid id PK "US-15"
        uuid deposit_id FK
        varchar entry_type "CASH_DEPOSIT_RECEIVED, CASH_DEPOSIT_RETURNED, DEPOSIT_CAPTURED"
    }
```

---

## 3. Event Flow

### 3.1 Check-in steps — Scenarios 1 to 5

```mermaid
flowchart TD
    A["1. ID verified (US-12)"] --> B{"2. Before 4 PM?"}
    B -- yes --> B1["Early check-in approved (US-12)"]
    B -- no --> C
    B1 --> C{"3. Deposit"}
    C -- card --> D["Stripe hold for the property amount<br/>on the kept card or a new card"]
    D --> E{Approved?}
    E -- no --> C
    E -- yes --> F
    C -- cash --> G["Agent enters own password<br/>cash deposit posted to the folio"]
    G --> H{Password correct?}
    H -- no --> G2["Failure counts toward the US-01 lockout"]
    G2 --> C
    H -- yes --> F["4. Assign an Available room of the booked type"]
    F --> I["5. Confirm: reservation In-House, room Occupied"]
```

### 3.2 Card hold — Scenarios 1 and 2

```mermaid
sequenceDiagram
    autonumber
    actor FDA as Front Desk Agent
    participant View as CheckInStepViews
    participant UC as PlaceDepositUseCase
    participant Pay as PaymentGateway

    FDA->>View: POST deposit (kept card or new card from Stripe fields)
    View->>UC: execute(reservation_id, payment_method_id, agent)
    UC->>UC: guard: ID verified, early approval if needed
    UC->>Pay: authorize_hold(property deposit amount, idempotency key)
    alt declined
        Pay-->>UC: declined
        UC-->>FDA: 402 declined, deposit still missing, try another card or cash
    else approved
        UC->>UC: Deposit CARD_HOLD, HELD
        UC-->>FDA: 201 deposit placed, continue to room assignment
    end
```

### 3.3 Domain events

| Event | Raised when | Consumers |
|---|---|---|
| `DepositHeld` | Card hold approved or cash deposit recorded | Dashboard flag (US-10) |
| `DepositDeclined` | Stripe declines the hold | Dashboard flag (US-10) |
| `RoomAssigned` | Room chosen | Check-in screen |
| `GuestCheckedIn` | Check-in completed | Reservation history (US-11), room state (US-19), housekeeping board (US-18), Night Audit (US-14) |
