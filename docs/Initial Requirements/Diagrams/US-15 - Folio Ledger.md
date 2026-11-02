# US-15 — Folio Ledger: Diagrams

> Sources: `US-15-folio-ledger.md`, `US-04-localized-tax-calculation.md`, `docs/Business Modeling/Business Modeling.md` (Section 2 "Folio", Section 4 "Financial Precision"), `CLAUDE.md`.
> Elements tagged **PENDING** depend on business rules not defined yet. They are placeholders in the design, not decisions.
> Data is scoped per **Property** (Business Modeling, Section 5) through the reservation each folio belongs to.

---

## 1. Class Diagram (Clean Architecture)

```mermaid
classDiagram
    direction LR

    namespace Domain {
        class Folio {
            <<Entity / Aggregate Root>>
            -FolioId id
            -ReservationId reservation_id
            -Currency currency
            -list~FolioTransaction~ transactions
            -int version
            +open(reservation_id: ReservationId)$ Folio
            +post_charge(charge: ChargeRequest) FolioTransaction
            +post_payment(payment: PaymentRequest) FolioTransaction
            +balance() Money
        }
        class FolioTransaction {
            <<Entity · immutable>>
            -FolioTransactionId id
            -TransactionType type
            -str description
            -PostingKey | None posting_key
            -list~LedgerLine~ lines
            -datetime posted_at_utc
            +is_balanced() bool
        }
        class LedgerLine {
            <<Value Object>>
            +LedgerAccount account
            +Money debit
            +Money credit
            +str | None tax_code
        }
        class LedgerAccount {
            <<Enumeration · chart of accounts PENDING>>
            GUEST_RECEIVABLE
            ROOM_REVENUE
            FINE_REVENUE
            TAX_PAYABLE
            CASH
            CARD_CLEARING
            DEPOSIT_CLEARING
        }
        class TransactionType {
            <<Enumeration>>
            ROOM_CHARGE
            FINE
            PAYMENT_CASH
            PAYMENT_CARD
            PAYMENT_DEPOSIT
        }
        class PostingKey {
            <<Value Object>>
            +str value
        }
        class Money {
            <<Value Object · US-04>>
            +Decimal amount
            +Currency currency
            +add(other: Money) Money
            +subtract(other: Money) Money
        }
        class FolioOpened {
            <<Domain Event>>
            +FolioId folio_id
            +ReservationId reservation_id
            +datetime occurred_at_utc
        }
        class ChargePosted {
            <<Domain Event>>
            +FolioId folio_id
            +TransactionType type
            +Money amount
            +list~TaxLine~ taxes
            +datetime occurred_at_utc
        }
        class PaymentPosted {
            <<Domain Event>>
            +FolioId folio_id
            +TransactionType type
            +Money amount
            +datetime occurred_at_utc
        }
        class UnbalancedTransactionError {
            <<Domain Exception>>
        }
        class CurrencyMismatchError {
            <<Domain Exception>>
        }
        class DuplicatePostingError {
            <<Domain Exception>>
        }
    }

    namespace Application {
        class CreateFolioOnReservationCreated {
            <<Event Handler>>
            +handle(event: ReservationCreated) None
        }
        class PostChargeUseCase {
            <<Use Case>>
            +execute(command: PostChargeCommand) FolioTransactionId
        }
        class PostPaymentUseCase {
            <<Use Case>>
            +execute(command: PostPaymentCommand) FolioTransactionId
        }
        class GetFolioUseCase {
            <<Query Use Case>>
            +execute(reservation_id: ReservationId) FolioView
        }
        class FolioView {
            <<DTO>>
            +UUID folio_id
            +list~FolioLineView~ entries
            +Money balance
        }
        class FolioRepository {
            <<Port>>
            +add(folio: Folio) None
            +get_by_reservation(reservation_id: ReservationId) Folio
            +save(folio: Folio) None
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
        class FolioDetailView {
            <<REST Controller>>
            +get(request, reservation_id) Response
        }
        class FolioChargesView {
            <<REST Controller>>
            +post(request, reservation_id) Response
        }
        class FolioPaymentsView {
            <<REST Controller>>
            +post(request, reservation_id) Response
        }
    }

    Folio *-- FolioTransaction
    FolioTransaction *-- LedgerLine
    FolioTransaction --> TransactionType
    FolioTransaction *-- PostingKey
    LedgerLine --> LedgerAccount
    LedgerLine *-- Money
    FolioTransaction ..> UnbalancedTransactionError : raises
    Folio ..> CurrencyMismatchError : raises
    Folio ..> DuplicatePostingError : raises
    Folio ..> FolioOpened : records
    Folio ..> ChargePosted : records
    Folio ..> PaymentPosted : records

    CreateFolioOnReservationCreated --> FolioRepository
    PostChargeUseCase --> FolioRepository
    PostChargeUseCase --> UnitOfWork
    PostChargeUseCase --> EventPublisher
    PostPaymentUseCase --> FolioRepository
    PostPaymentUseCase --> UnitOfWork
    PostPaymentUseCase --> EventPublisher
    GetFolioUseCase --> FolioRepository
    GetFolioUseCase ..> FolioView

    FolioDetailView --> GetFolioUseCase
    FolioChargesView --> PostChargeUseCase
    FolioPaymentsView --> PostPaymentUseCase
```

### Design notes
- **Double-entry:** every `FolioTransaction` has at least two `LedgerLine`s, and the sum of debits equals the sum of credits (`UnbalancedTransactionError` otherwise).
  - **Charge** (e.g., room night with HST): debit `GUEST_RECEIVABLE` for the gross amount; credit `ROOM_REVENUE` for the net amount and `TAX_PAYABLE` (with `tax_code`) for the tax.
  - **Payment** (cash, card or deposit): debit `CASH` / `CARD_CLEARING` / `DEPOSIT_CLEARING`; credit `GUEST_RECEIVABLE`.
- **Balance:** `balance()` is the debit balance of `GUEST_RECEIVABLE`. It must be `0.00` for check-out (US-17).
- **Immutability:** posted transactions are never edited or deleted. Corrections such as voids and refunds will be new reversing transactions; their rules and who authorizes them are PENDING.
- **`PostingKey`** makes postings idempotent. For example, `ROOM_CHARGE:{business_date}` lets the Night Audit (US-14) post each night only once (`DuplicatePostingError`).
- **Money everywhere:** amounts are `Money` (`Decimal` plus currency, US-04). Mixing currencies raises `CurrencyMismatchError`. The folio currency is CAD.
- **The chart of accounts is a minimal proposal** to satisfy double-entry. The final account list is PENDING validation by the business or an accountant.
- **PENDING:** whether split folios are supported (the model keeps one folio per reservation).
- **Permission:** reading and posting require `FINANCIAL_DATA_ACCESS`, so Housekeepers are denied (US-01).

---

## 2. ER Diagram (PostgreSQL persistence)

```mermaid
erDiagram
    RESERVATION ||--|| FOLIO : "has exactly one"
    FOLIO ||--o{ FOLIO_TRANSACTION : "records"
    FOLIO_TRANSACTION ||--|{ LEDGER_LINE : "is made of"
    LEDGER_ACCOUNT ||--o{ LEDGER_LINE : "classifies"
    STAFF_MEMBER ||--o{ FOLIO_TRANSACTION : "posts"
    NIGHT_AUDIT_RUN ||--o{ FOLIO_TRANSACTION : "posts"

    FOLIO {
        uuid id PK
        uuid reservation_id FK "UNIQUE, NOT NULL"
        char currency "CAD"
        int version "optimistic locking"
        timestamptz created_at "UTC"
    }
    FOLIO_TRANSACTION {
        uuid id PK
        uuid folio_id FK
        varchar transaction_type "ROOM_CHARGE, FINE, PAYMENT_CASH, PAYMENT_CARD, PAYMENT_DEPOSIT"
        varchar description
        varchar posting_key "nullable, UNIQUE (folio_id, posting_key)"
        date business_date "nullable, set for room charges"
        uuid posted_by_staff_id FK "nullable (system postings)"
        uuid night_audit_run_id FK "nullable, US-14"
        timestamptz posted_at "UTC"
    }
    LEDGER_LINE {
        uuid id PK
        uuid transaction_id FK
        varchar account_code FK
        numeric debit_amount "numeric(12,2), >= 0"
        numeric credit_amount "numeric(12,2), >= 0"
        char currency "CAD"
        varchar tax_code "nullable: GST, HST, PST"
    }
    LEDGER_ACCOUNT {
        varchar code PK "chart of accounts PENDING"
        varchar name
        varchar account_type "ASSET, LIABILITY, REVENUE"
    }
    RESERVATION {
        uuid id PK "partial: US-06"
    }
    STAFF_MEMBER {
        uuid id PK "partial: US-01"
    }
    NIGHT_AUDIT_RUN {
        uuid id PK "partial: US-14"
    }
```

### Design notes
- **Balanced transactions in the database:** a deferred constraint trigger checks that `SUM(debit_amount) = SUM(credit_amount)` per `transaction_id` at commit time.
- **Line checks:** `CHECK (debit_amount = 0 OR credit_amount = 0)` keeps each line one-sided, and `CHECK (debit_amount >= 0 AND credit_amount >= 0)` forbids negative amounts.
- **Append-only:** `FOLIO_TRANSACTION` and `LEDGER_LINE` are insert-only. The application database user has no `UPDATE`/`DELETE` privilege on them.
- **Balance query:** `SUM(debit) - SUM(credit)` on `GUEST_RECEIVABLE` lines of the folio. It can be cached on `FOLIO` later if needed.

---

## 3. Event Flow

### 3.1 Folio created with the reservation — Scenario 1

```mermaid
sequenceDiagram
    autonumber
    participant Book as BookingService (US-06)
    participant Bus as EventPublisher
    participant H as CreateFolioOnReservationCreated
    participant Folio as Folio
    participant Repo as FolioRepository

    Book->>Bus: publish(ReservationCreated) inside the booking transaction
    Bus->>H: handle(event)
    H->>Folio: Folio.open(reservation_id)
    Folio-->>H: Folio (CAD, empty, balance 0.00)
    H->>Repo: add(folio)
    Note over Book,Repo: Same transaction as the reservation, so a reservation never exists without its folio
```

### 3.2 Posting a charge and a payment — Scenarios 2 and 3

```mermaid
sequenceDiagram
    autonumber
    participant Caller as Night Audit (US-14) / Front Desk
    participant UC as PostChargeUseCase / PostPaymentUseCase
    participant Repo as FolioRepository
    participant Folio as Folio
    participant Bus as EventPublisher

    Caller->>UC: post ROOM_CHARGE 100.00 CAD + HST (rate US-04)
    UC->>Repo: get_by_reservation(reservation_id)
    Repo-->>UC: Folio
    UC->>Folio: post_charge(net 100.00, taxes [HST], posting_key)
    Folio->>Folio: lines: DR GUEST_RECEIVABLE gross / CR ROOM_REVENUE 100.00 / CR TAX_PAYABLE (HST)
    Folio->>Folio: is_balanced() and Decimal precision check
    UC->>Repo: save(folio) with version check
    UC->>Bus: publish(ChargePosted)
    UC-->>Caller: transaction id, balance updated

    Caller->>UC: post PAYMENT_CARD (gross amount)
    UC->>Folio: post_payment(CARD, amount)
    Folio->>Folio: lines: DR CARD_CLEARING / CR GUEST_RECEIVABLE
    UC->>Repo: save(folio)
    UC->>Bus: publish(PaymentPosted)
    UC-->>Caller: balance 0.00
```

### 3.3 Domain events

| Event | Emitted by | When | Payload | Consumers |
|---|---|---|---|---|
| `FolioOpened` | `Folio` | Reservation created | `folio_id`, `reservation_id`, `occurred_at_utc` | none |
| `ChargePosted` | `Folio` | Room charge or fine posted | `folio_id`, `type`, `amount`, `taxes`, `occurred_at_utc` | Reports (US-22) |
| `PaymentPosted` | `Folio` | Cash, card or deposit payment posted | `folio_id`, `type`, `amount`, `occurred_at_utc` | Check-out readiness (US-17, read side) |
