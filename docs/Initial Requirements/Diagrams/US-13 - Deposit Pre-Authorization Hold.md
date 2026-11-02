# US-13 — Deposit Pre-Authorization Hold: Diagrams

> Sources: `US-13-deposit-pre-authorization-hold.md`, `US-12-check-in-with-age-verification.md`, `US-19-room-state-machine-and-cleaning-verification.md`, `docs/Business Modeling/Business Modeling.md` (Phase 2, Section 4), `CLAUDE.md`.
> Elements tagged **PENDING** depend on business rules not defined yet. They are placeholders in the design, not decisions.
> Data is scoped per **Property** (Business Modeling, Section 5) even where the story text does not mention it.

---

## 1. Class Diagram (Clean Architecture)

```mermaid
classDiagram
    direction LR

    namespace Domain {
        class DepositHold {
            <<Entity / Aggregate Root>>
            -DepositHoldId id
            -ReservationId reservation_id
            -Money amount
            -DepositHoldStatus status
            -str | None gateway_authorization_id
            -Money captured_amount
            +request(reservation_id, amount)$ DepositHold
            +mark_authorized(authorization_id: str) None
            +mark_declined(reason: str) None
            +mark_captured(amount: Money) None
            +mark_released() None
        }
        class DepositHoldStatus {
            <<Enumeration>>
            REQUESTED
            AUTHORIZED
            DECLINED
            CAPTURED
            RELEASED
        }
        class DepositPolicy {
            <<Domain Service>>
            +HOLD_AMOUNT = Money(250.00, CAD)
        }
        class CheckInService {
            <<Domain Service>>
            +check_in(reservation, room, id_verification, hold) None
        }
        class Reservation {
            <<Entity · US-06 / US-11>>
            +check_in(room_id: RoomId) None
        }
        class Room {
            <<Entity · US-02 / US-19>>
            +occupy() None
        }
        class DepositHoldAuthorized {
            <<Domain Event>>
            +ReservationId reservation_id
            +Money amount
            +datetime occurred_at_utc
        }
        class DepositHoldDeclined {
            <<Domain Event>>
            +ReservationId reservation_id
            +datetime occurred_at_utc
        }
        class GuestCheckedIn {
            <<Domain Event>>
            +ReservationId reservation_id
            +RoomId room_id
            +datetime occurred_at_utc
        }
        class CheckInRequirementsNotMetError {
            <<Domain Exception>>
        }
    }

    namespace Application {
        class PlaceDepositHoldUseCase {
            <<Use Case>>
            +execute(reservation_id: ReservationId) DepositHoldView
        }
        class CompleteCheckInUseCase {
            <<Use Case>>
            +execute(command: CompleteCheckInCommand) None
        }
        class CompleteCheckInCommand {
            <<DTO>>
            +UUID reservation_id
            +UUID room_id
            +UUID staff_member_id
        }
        class PaymentGateway {
            <<Port · Stripe, PENDING>>
            +authorize(token: PaymentMethodToken, amount: Money, idempotency_key: str) AuthorizationResult
            +capture(authorization_id: str, amount: Money, idempotency_key: str) CaptureResult
            +release(authorization_id: str, idempotency_key: str) None
        }
        class DepositHoldRepository {
            <<Port>>
            +add(hold: DepositHold) None
            +save(hold: DepositHold) None
            +get_active_for_reservation(reservation_id: ReservationId) DepositHold | None
        }
        class ReservationRepository {
            <<Port · US-06>>
            +get_by_id(reservation_id) Reservation
            +save(reservation) None
        }
        class RoomRepository {
            <<Port · US-02>>
            +get_by_id(room_id) Room
            +save(room) None
        }
        class IdVerificationRepository {
            <<Port · US-12>>
            +get_by_reservation(reservation_id) IdVerification
        }
        class UnitOfWork {
            <<Port>>
            +commit() None
        }
        class EventPublisher {
            <<Port>>
            +publish(event: DomainEvent) None
        }
    }

    namespace Infrastructure {
        class GatewayPaymentAdapter {
            <<Adapter · PENDING gateway>>
        }
        class DjangoDepositHoldRepository {
            <<Adapter>>
        }
    }

    namespace Interface {
        class DepositHoldView {
            <<REST Controller>>
            +post(request, reservation_id) Response
        }
        class CheckInView {
            <<REST Controller>>
            +post(request, reservation_id) Response
        }
    }

    DepositHold --> DepositHoldStatus
    DepositHold ..> DepositPolicy : amount from
    DepositHold ..> DepositHoldAuthorized : records
    DepositHold ..> DepositHoldDeclined : records
    CheckInService ..> Reservation
    CheckInService ..> Room
    CheckInService ..> CheckInRequirementsNotMetError : raises
    CheckInService ..> GuestCheckedIn : records

    PlaceDepositHoldUseCase --> PaymentGateway
    PlaceDepositHoldUseCase --> DepositHoldRepository
    PlaceDepositHoldUseCase --> ReservationRepository
    PlaceDepositHoldUseCase --> EventPublisher
    CompleteCheckInUseCase ..> CompleteCheckInCommand
    CompleteCheckInUseCase --> CheckInService
    CompleteCheckInUseCase --> ReservationRepository
    CompleteCheckInUseCase --> RoomRepository
    CompleteCheckInUseCase --> IdVerificationRepository
    CompleteCheckInUseCase --> DepositHoldRepository
    CompleteCheckInUseCase --> UnitOfWork
    CompleteCheckInUseCase --> EventPublisher

    GatewayPaymentAdapter ..|> PaymentGateway
    DjangoDepositHoldRepository ..|> DepositHoldRepository
    DepositHoldView --> PlaceDepositHoldUseCase
    CheckInView --> CompleteCheckInUseCase
```

### Design notes
- **`DepositHold` has its own lifecycle** (`REQUESTED → AUTHORIZED | DECLINED`, later `CAPTURED` in US-16 or `RELEASED` in US-17). The amount comes from `DepositPolicy` ($250.00 CAD as `Money`). Whether the amount differs per property is PENDING (Business Modeling, Section 5).
- **Gateway calls are idempotent:** every `PaymentGateway` call carries an idempotency key derived from the hold id, so a network retry never places two holds.
- **The hold is recorded before the gateway call** (status `REQUESTED`). This leaves a trace even if the process stops mid-call, so the hold can be reconciled.
- **`CheckInService` enforces all check-in requirements together (Scenario 3):**
  - the reservation is `CONFIRMED`;
  - the ID verification allows check-in (US-12, eligible or overridden);
  - the hold is `AUTHORIZED`;
  - the room is `AVAILABLE` (US-19).

  Then `Reservation` changes to `IN_HOUSE` and `Room` to `OCCUPIED` in a single transaction.
- **A declined hold (Scenario 2)** leaves the reservation without an authorized hold. The dashboard (US-10) then shows `MISSING_DEPOSIT`, and `CheckInService` refuses to complete the check-in.
- **Folio:** a hold is not a payment. A payment entry is posted only when funds are captured (US-16).
- **PENDING:**
  - guests without a credit card (e.g., cash);
  - hold expiration on long stays;
  - when and how the physical room is assigned (here the agent sends `room_id` at completion).

---

## 2. ER Diagram (PostgreSQL persistence)

```mermaid
erDiagram
    RESERVATION ||--o{ DEPOSIT_HOLD : "is secured by"
    RESERVATION }o--o| ROOM : "is assigned"

    DEPOSIT_HOLD {
        uuid id PK "also the gateway idempotency key"
        uuid reservation_id FK
        numeric amount "numeric(12,2), 250.00"
        char currency "CAD"
        varchar status "REQUESTED, AUTHORIZED, DECLINED, CAPTURED, RELEASED"
        varchar gateway_authorization_id "UNIQUE, nullable until authorized"
        numeric captured_amount "numeric(12,2), default 0"
        varchar decline_reason "nullable"
        timestamptz requested_at "UTC"
        timestamptz authorized_at "UTC, nullable"
        timestamptz expires_at "PENDING: long stays"
        timestamptz released_at "UTC, nullable"
    }
    RESERVATION {
        uuid id PK "partial: US-06"
        varchar status "IN_HOUSE after check-in"
        uuid room_id FK "set at check-in, assignment rules PENDING"
        int version
    }
    ROOM {
        uuid id PK "partial: US-02"
        varchar state "OCCUPIED after check-in, US-19"
        int version
    }
```

### Design notes
- **One active hold per reservation:** a partial unique index enforces it (`UNIQUE (reservation_id) WHERE status IN ('REQUESTED','AUTHORIZED')`). Declined attempts remain as history.
- **Money columns:** amounts use `numeric(12,2)` with a currency column, following US-04.
- **Concurrency:** `RESERVATION.version` and `ROOM.version` stop two agents from checking different guests into the same room at the same time.

---

## 3. Event Flow

### 3.1 Placing the hold — Scenarios 1 and 2

```mermaid
sequenceDiagram
    autonumber
    actor Agent as Front Desk Agent
    participant View as DepositHoldView<br/>POST /api/v1/reservations/{id}/deposit-hold
    participant UC as PlaceDepositHoldUseCase
    participant Repo as DepositHoldRepository
    participant GW as PaymentGateway
    participant Bus as EventPublisher

    Agent->>View: Request deposit hold (ID already verified, US-12)
    View->>UC: execute(reservation_id)
    UC->>Repo: add(DepositHold REQUESTED, 250.00 CAD)
    UC->>GW: authorize(token, 250.00 CAD, idempotency_key = hold id)
    alt Approved (Scenario 1)
        GW-->>UC: authorization_id
        UC->>UC: hold.mark_authorized(authorization_id)
        UC->>Repo: save(hold)
        UC->>Bus: publish(DepositHoldAuthorized)
        UC-->>View: AUTHORIZED
        View-->>Agent: 201 Created, hold of 250.00 CAD placed
    else Declined (Scenario 2)
        GW-->>UC: declined (reason)
        UC->>UC: hold.mark_declined(reason)
        UC->>Repo: save(hold)
        UC->>Bus: publish(DepositHoldDeclined)
        UC-->>View: DECLINED
        View-->>Agent: 402 Payment Required, missing deposit flagged, check-in cannot complete
    end
```

### 3.2 Completing the check-in — Scenario 3

```mermaid
sequenceDiagram
    autonumber
    actor Agent as Front Desk Agent
    participant View as CheckInView<br/>POST /api/v1/reservations/{id}/check-in
    participant UC as CompleteCheckInUseCase
    participant Svc as CheckInService
    participant Repos as Reservation, Room, IdVerification, DepositHold repositories
    participant UoW as UnitOfWork
    participant Bus as EventPublisher

    Agent->>View: Hand over keys, confirm check-in {room_id}
    View->>UC: execute(command)
    UC->>Repos: load reservation, room, ID verification, active hold
    Repos-->>UC: aggregates
    UC->>Svc: check_in(reservation, room, id_verification, hold)
    alt Any requirement missing
        Svc-->>UC: raise CheckInRequirementsNotMetError (which ones)
        UC-->>View: error
        View-->>Agent: 409 Conflict with the missing requirements
    else All requirements met
        Svc->>Svc: reservation.check_in(room_id) to IN_HOUSE
        Svc->>Svc: room.occupy() to OCCUPIED
        UC->>Repos: save reservation and room (version check)
        UC->>Bus: publish(GuestCheckedIn)
        UC->>UoW: commit
        UC-->>View: done
        View-->>Agent: 200 OK, reservation In-House, room Occupied
    end
```

### 3.3 Domain events

| Event | Emitted by | When | Payload | Consumers |
|---|---|---|---|---|
| `DepositHoldAuthorized` | `PlaceDepositHoldUseCase` | Gateway approves the hold | `reservation_id`, `amount`, `occurred_at_utc` | Dashboard flag cleared (US-10, read side) |
| `DepositHoldDeclined` | `PlaceDepositHoldUseCase` | Gateway declines the hold | `reservation_id`, `occurred_at_utc` | Dashboard flag kept (US-10, read side) |
| `GuestCheckedIn` | `CompleteCheckInUseCase` | Check-in completed | `reservation_id`, `room_id`, `occurred_at_utc` | `ReservationStatusChanged` history (US-11); `RoomStateChanged` and real-time housekeeping board (US-18, US-19) |
