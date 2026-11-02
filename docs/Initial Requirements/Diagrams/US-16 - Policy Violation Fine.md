# US-16 — Policy Violation Fine: Diagrams

> Sources: `US-16-policy-violation-fine.md`, `US-13-deposit-pre-authorization-hold.md`, `US-15-folio-ledger.md`, `docs/Business Modeling/Business Modeling.md` (Phase 4, Scenario B), `CLAUDE.md`.
> Elements tagged **PENDING** depend on business rules not defined yet. They are placeholders in the design, not decisions.
> Data is scoped per **Property** (Business Modeling, Section 5) even where the story text does not mention it.

---

## 1. Class Diagram (Clean Architecture)

```mermaid
classDiagram
    direction LR

    namespace Domain {
        class FineType {
            <<Entity · catalog>>
            -FineTypeCode code
            -dict~Language, str~ names
            -Money amount
            -bool | None taxable
        }
        class FineTypeCode {
            <<Value Object>>
            +str value
        }
        class Folio {
            <<Entity / Aggregate Root · US-15>>
            +post_charge(charge: ChargeRequest) FolioTransaction
            +post_payment(payment: PaymentRequest) FolioTransaction
            +balance() Money
        }
        class DepositHold {
            <<Entity / Aggregate Root · US-13>>
            -Money amount
            -Money captured_amount
            +remaining() Money
            +mark_captured(amount: Money) None
        }
        class HoldSettlementPolicy {
            <<Domain Service>>
            +amount_to_capture(balance: Money, hold: DepositHold) Money
        }
        class PolicyViolationReport {
            <<Entity · PENDING>>
            -ReservationId reservation_id
            -RoomId room_id
            -FineTypeCode violation
            -StaffMemberId reported_by
            -datetime reported_at_utc
        }
        class FinePosted {
            <<Domain Event>>
            +ReservationId reservation_id
            +FineTypeCode fine_type
            +Money amount
            +datetime occurred_at_utc
        }
        class DepositCaptured {
            <<Domain Event>>
            +ReservationId reservation_id
            +Money amount
            +datetime occurred_at_utc
        }
        class NoActiveHoldError {
            <<Domain Exception>>
        }
        class BalanceExceedsHoldError {
            <<Domain Exception · handling PENDING>>
        }
    }

    namespace Application {
        class PostFineUseCase {
            <<Use Case>>
            +execute(command: PostFineCommand) FolioTransactionId
        }
        class SettleBalanceFromHoldUseCase {
            <<Use Case>>
            +execute(reservation_id: ReservationId) SettlementResult
        }
        class PostFineCommand {
            <<DTO>>
            +UUID reservation_id
            +str fine_type_code
            +UUID staff_member_id
            +UUID | None violation_report_id
        }
        class FineTypeRepository {
            <<Port>>
            +get(code: FineTypeCode) FineType
        }
        class FolioRepository {
            <<Port · US-15>>
            +get_by_reservation(reservation_id) Folio
            +save(folio) None
        }
        class DepositHoldRepository {
            <<Port · US-13>>
            +get_active_for_reservation(reservation_id) DepositHold | None
            +save(hold) None
        }
        class PaymentGateway {
            <<Port · US-13>>
            +capture(authorization_id: str, amount: Money, idempotency_key: str) CaptureResult
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

    namespace Interface {
        class FolioFinesView {
            <<REST Controller>>
            +post(request, reservation_id) Response
        }
        class HoldSettlementView {
            <<REST Controller>>
            +post(request, reservation_id) Response
        }
    }

    FineType *-- FineTypeCode
    HoldSettlementPolicy ..> DepositHold
    HoldSettlementPolicy ..> BalanceExceedsHoldError : signals
    PostFineUseCase ..> FinePosted : emits
    SettleBalanceFromHoldUseCase ..> DepositCaptured : emits

    PostFineUseCase ..> PostFineCommand
    PostFineUseCase --> FineTypeRepository
    PostFineUseCase --> FolioRepository
    PostFineUseCase --> UnitOfWork
    PostFineUseCase --> EventPublisher
    SettleBalanceFromHoldUseCase --> FolioRepository
    SettleBalanceFromHoldUseCase --> DepositHoldRepository
    SettleBalanceFromHoldUseCase --> HoldSettlementPolicy
    SettleBalanceFromHoldUseCase --> PaymentGateway
    SettleBalanceFromHoldUseCase --> UnitOfWork
    SettleBalanceFromHoldUseCase --> EventPublisher
    SettleBalanceFromHoldUseCase ..> NoActiveHoldError : raises

    FolioFinesView --> PostFineUseCase
    HoldSettlementView --> SettleBalanceFromHoldUseCase
```

### Design notes
- **Fines come from a catalog (`FineType`)**, not free text. The only defined fine is `CANNABIS_CLEANING` = $250.00 CAD, with EN/FR names for invoices. Other fine types (pets, damages) are PENDING and will be added as catalog data.
- **Posting a fine (Scenario 1)** creates a `FINE` transaction in the folio (US-15): debit `GUEST_RECEIVABLE`, credit `FINE_REVENUE`. Whether fines are taxable is PENDING (`taxable` is nullable); if they are, `TAX_PAYABLE` lines are added like any charge.
- **Settling from the hold (Scenario 2):**
  - `HoldSettlementPolicy` returns the amount to capture: the outstanding balance, limited to the hold's remaining amount;
  - the capture goes to the gateway with an idempotency key (US-13);
  - on success, `PAYMENT_DEPOSIT` is posted to the folio (debit `DEPOSIT_CLEARING`, credit `GUEST_RECEIVABLE`) and the hold records the captured amount.
- **Order of operations:** the gateway capture happens **before** the local commit. If the commit then fails, a retry repeats the capture with the same idempotency key, and the gateway returns the original result instead of capturing twice.
- **PENDING:**
  - how housekeeping reports a violation (`PolicyViolationReport` is drawn only as a placeholder);
  - what happens when the balance exceeds the hold (`BalanceExceedsHoldError`);
  - whether fines are taxable.
- **Permission:** posting fines requires `FINANCIAL_DATA_ACCESS` (Front Desk Agent, US-01).

---

## 2. ER Diagram (PostgreSQL persistence)

```mermaid
erDiagram
    FINE_TYPE ||--o{ FOLIO_TRANSACTION : "is charged as"
    FOLIO ||--o{ FOLIO_TRANSACTION : "records"
    RESERVATION ||--o{ DEPOSIT_HOLD : "is secured by"
    DEPOSIT_HOLD ||--o{ DEPOSIT_CAPTURE : "is captured by"
    RESERVATION ||--o{ POLICY_VIOLATION_REPORT : "may have"

    FINE_TYPE {
        varchar code PK "CANNABIS_CLEANING, others PENDING"
        varchar name_en
        varchar name_fr
        numeric amount "numeric(12,2), 250.00"
        char currency "CAD"
        boolean taxable "nullable, PENDING"
        boolean is_active
    }
    FOLIO_TRANSACTION {
        uuid id PK "partial: US-15"
        uuid folio_id FK
        varchar transaction_type "FINE, PAYMENT_DEPOSIT"
        varchar fine_type_code FK "nullable, set for FINE"
    }
    DEPOSIT_HOLD {
        uuid id PK "partial: US-13"
        uuid reservation_id FK
        varchar gateway_authorization_id
        numeric captured_amount "numeric(12,2)"
    }
    DEPOSIT_CAPTURE {
        uuid id PK "gateway idempotency key"
        uuid deposit_hold_id FK
        numeric amount "numeric(12,2)"
        char currency "CAD"
        varchar gateway_capture_id "UNIQUE"
        uuid folio_transaction_id FK "the PAYMENT_DEPOSIT posted"
        timestamptz captured_at "UTC"
    }
    POLICY_VIOLATION_REPORT {
        uuid id PK "PENDING: how violations are reported"
        uuid reservation_id FK
        uuid room_id FK
        varchar fine_type_code FK
        uuid reported_by_staff_id FK
        timestamptz reported_at "UTC"
    }
    RESERVATION {
        uuid id PK "partial: US-06"
    }
    FOLIO {
        uuid id PK "partial: US-15"
    }
```

### Design notes
- **`DEPOSIT_CAPTURE`** keeps each capture with its gateway reference and the folio payment it produced, so captures can be reconciled with the gateway's records.
- **Captured amount limit:** a check, or trigger, guarantees `DEPOSIT_HOLD.captured_amount` never exceeds `DEPOSIT_HOLD.amount`.
- **`POLICY_VIOLATION_REPORT` is PENDING.** It exists only if housekeeping reports violations through the system.

---

## 3. Event Flow

### 3.1 Posting the fine — Scenario 1

```mermaid
sequenceDiagram
    autonumber
    actor HK as Housekeeping
    actor Agent as Front Desk Agent
    participant View as FolioFinesView<br/>POST /api/v1/reservations/{id}/folio/fines
    participant UC as PostFineUseCase
    participant Cat as FineTypeRepository
    participant Repo as FolioRepository
    participant Bus as EventPublisher

    HK-->>Agent: Smoke reported in the room (reporting channel PENDING)
    Agent->>View: POST {fine_type: CANNABIS_CLEANING}
    View->>UC: execute(command)
    UC->>Cat: get(CANNABIS_CLEANING)
    Cat-->>UC: FineType (250.00 CAD, taxable PENDING)
    UC->>Repo: get_by_reservation(reservation_id)
    Repo-->>UC: Folio
    UC->>UC: folio.post_charge(FINE 250.00 CAD)
    UC->>Repo: save(folio)
    UC->>Bus: publish(FinePosted)
    UC-->>View: transaction id
    View-->>Agent: 201 Created, balance now includes the fine
```

### 3.2 Settling the balance from the hold — Scenario 2

```mermaid
sequenceDiagram
    autonumber
    actor Agent as Front Desk Agent
    participant View as HoldSettlementView<br/>POST /api/v1/reservations/{id}/deposit-hold/captures
    participant UC as SettleBalanceFromHoldUseCase
    participant Holds as DepositHoldRepository
    participant Folios as FolioRepository
    participant Pol as HoldSettlementPolicy
    participant GW as PaymentGateway
    participant Bus as EventPublisher

    Agent->>View: Settle balance from hold
    View->>UC: execute(reservation_id)
    UC->>Holds: get_active_for_reservation(reservation_id)
    alt No active hold
        Holds-->>UC: None
        UC-->>View: raise NoActiveHoldError
        View-->>Agent: 409 Conflict
    else Active hold (250.00 CAD)
        Holds-->>UC: DepositHold
        UC->>Folios: get_by_reservation(reservation_id)
        Folios-->>UC: Folio (balance 250.00 CAD)
        UC->>Pol: amount_to_capture(balance, hold)
        alt Balance within the hold
            Pol-->>UC: 250.00 CAD
            UC->>GW: capture(authorization_id, 250.00 CAD, idempotency_key)
            GW-->>UC: capture_id
            UC->>UC: hold.mark_captured(250.00) and folio.post_payment(DEPOSIT, 250.00)
            UC->>Holds: save(hold)
            UC->>Folios: save(folio)
            UC->>Bus: publish(DepositCaptured)
            UC-->>View: settled, balance 0.00
            View-->>Agent: 200 OK, ready for check-out (US-17)
        else Balance exceeds the hold
            Pol-->>UC: BalanceExceedsHoldError
            Note over UC,Agent: PENDING: handling when the balance owed exceeds the hold
        end
    end
```

### 3.3 Domain events

| Event | Emitted by | When | Payload | Consumers |
|---|---|---|---|---|
| `FinePosted` | `PostFineUseCase` | Fine charged to the folio | `reservation_id`, `fine_type`, `amount`, `occurred_at_utc` | Reports (US-22) |
| `DepositCaptured` | `SettleBalanceFromHoldUseCase` | Funds captured from the hold | `reservation_id`, `amount`, `occurred_at_utc` | Check-out (US-17): no release needed when fully captured |
