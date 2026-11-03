# US-15 — Folio Ledger: Diagrams

> Source: `US-15-folio-ledger.md`. Posting stories: US-06, US-07, US-09 (payments), US-11 (fees and refunds), US-13 (cash deposit), US-14 (room nights and taxes), US-16 (fines and captures), US-17 (check-out).

## Business rules reflected

| Rule (US-15) | Where it appears |
|---|---|
| Exactly one folio per reservation | `FOLIO.reservation_id` unique, created with the reservation |
| Double-entry ledger | `LedgerEntry` with balanced `LedgerLine` debits and credits |
| Charge types: room night, taxes (HST, levy), fines, cancellation fee, no-show fee | `EntryType` (charges) |
| Payment types: Stripe card, OTA prepaid, OTA prepaid adjustment, cash, deposit captured from a hold, cash deposit received and returned, refunds (Stripe or cash) | `EntryType` (payments) |
| Lifecycle refunds (cancellation, No-Show, early departure) are not corrections | Posted by the system or a Front Desk Agent via `FolioService`; only `VoidEntryUseCase` and `IssueRefundUseCase` are GM-only |
| Only these types; no manual charges | `PostingRules` maps each type to fixed accounts; no free-form endpoint |
| Split payments | Many payment entries per folio |
| Corrections GM only: void a charge, refund through Stripe or cash | `VoidEntryUseCase`, `IssueRefundUseCase` |
| Corrections add a reversing entry with a reason, who and when; never edit or delete | `reverses_entry_id`, append-only table |
| Starting accounts (adjustable by an accountant) | `Account` enum |
| CAD only | `Money.currency = CAD` check |
| FDA and GM view folios; Housekeepers never | `FRONT_DESK_WORK` permission (US-01) |

---

## 1. Class Diagram (Clean Architecture)

```mermaid
classDiagram
    direction LR

    namespace Domain {
        class Folio {
            <<Aggregate Root>>
            +FolioId id
            +ReservationId reservation_id
            +list~LedgerEntry~ entries
            +post(entry_type, amount, context) LedgerEntry
            +reverse(entry_id, reason, gm) LedgerEntry
            +balance() Money
        }
        class LedgerEntry {
            <<Entity · immutable>>
            +EntryId id
            +EntryType type
            +Money amount
            +list~LedgerLine~ lines
            +EntryId reverses
            +str reason
            +Actor posted_by
            +datetime posted_at
        }
        class LedgerLine {
            <<Value Object>>
            +Account account
            +Money debit
            +Money credit
        }
        class EntryType {
            <<Enumeration>>
            ROOM_NIGHT
            TAX_HST
            TAX_MARKETING_LEVY
            FINE
            CANCELLATION_FEE
            NO_SHOW_FEE
            STRIPE_CARD
            OTA_PREPAID
            OTA_PREPAID_ADJUSTMENT
            CASH
            DEPOSIT_CAPTURED
            CASH_DEPOSIT_RECEIVED
            CASH_DEPOSIT_RETURNED
            REFUND_STRIPE
            REFUND_CASH
        }
        class Account {
            <<Enumeration>>
            GUEST_RECEIVABLE
            CASH
            CARD_STRIPE
            OTA_RECEIVABLE
            ROOM_REVENUE
            FINE_REVENUE
            FEE_REVENUE
            HST_PAYABLE
            MARKETING_LEVY_PAYABLE
            CASH_DEPOSITS_HELD
        }
        class PostingRules {
            <<Domain Service>>
            +lines_for(entry_type, amount) list~LedgerLine~
        }
        class FolioRepository {
            <<Port>>
        }
    }

    namespace Application {
        class FolioService {
            <<Application Service>>
            +post(reservation_id, entry_type, amount, context) LedgerEntry
        }
        class VoidEntryUseCase {
            <<GM>>
            +execute(entry_id, reason, gm) None
        }
        class IssueRefundUseCase {
            <<GM>>
            +execute(folio_id, amount, method, reason, gm) None
        }
        class GetFolioUseCase {
            <<Query · FDA and GM>>
        }
        class PaymentGateway {
            <<Port>>
        }
    }

    namespace Infrastructure {
        class DjangoFolioRepository {
            <<append-only tables>>
        }
    }

    namespace Interface {
        class FolioViews {
            <<REST>>
            GET /api/v1/reservations/id/folio
            POST /api/v1/folio-entries/id/void
            POST /api/v1/folios/id/refunds
        }
    }

    Folio *-- LedgerEntry
    LedgerEntry *-- LedgerLine
    LedgerEntry --> EntryType
    LedgerLine --> Account
    Folio --> PostingRules
    FolioService --> FolioRepository
    VoidEntryUseCase --> FolioRepository
    IssueRefundUseCase --> FolioRepository
    IssueRefundUseCase --> PaymentGateway
    GetFolioUseCase --> FolioRepository
    DjangoFolioRepository ..|> FolioRepository
    FolioViews --> GetFolioUseCase
    FolioViews --> VoidEntryUseCase
    FolioViews --> IssueRefundUseCase
```

### Design notes
- **Posting rules (debit / credit):**

  | Entry type | Debit | Credit |
  |---|---|---|
  | `ROOM_NIGHT` | Guest receivable | Room revenue |
  | `TAX_HST` / `TAX_MARKETING_LEVY` | Guest receivable | HST payable / Marketing Levy payable |
  | `FINE` | Guest receivable | Fine revenue |
  | `CANCELLATION_FEE` / `NO_SHOW_FEE` | Guest receivable | Fee revenue |
  | `STRIPE_CARD` | Card (Stripe) | Guest receivable |
  | `OTA_PREPAID` | OTA receivable | Guest receivable |
  | `OTA_PREPAID_ADJUSTMENT` | Guest receivable | OTA receivable |
  | `CASH` | Cash | Guest receivable |
  | `DEPOSIT_CAPTURED` | Card (Stripe) | Guest receivable |
  | `CASH_DEPOSIT_RECEIVED` | Cash | Cash deposits held |
  | `CASH_DEPOSIT_RETURNED` | Cash deposits held | Cash |
  | `REFUND_STRIPE` / `REFUND_CASH` | Guest receivable | Card (Stripe) / Cash |

- **Balance** = debits − credits on guest receivable. Cash deposit entries do not touch guest receivable, so they never change the amount the guest owes; fines deducted from a cash deposit are settled at check-out (US-17).
- **OTA prepaid adjustment:** when an OTA guest leaves early (US-17), the unused part of the OTA prepaid amount is reversed (`OTA_PREPAID_ADJUSTMENT`). No money moves in the system; the OTA refunds the guest.
- **Void (Scenario 5):** only charge entries can be voided; the reversing entry swaps debits and credits, stores `reverses_entry_id`, the reason and the GM. An entry can be reversed only once.
- **Refund correction:** `REFUND_STRIPE` calls Stripe first and posts after success; `REFUND_CASH` is posted when the GM hands back cash.
- **Database protection:** no `UPDATE` or `DELETE` grants on the ledger tables for the application role; a trigger rejects both.

---

## 2. ER Diagram

```mermaid
erDiagram
    RESERVATION ||--|| FOLIO : "has"
    FOLIO ||--o{ LEDGER_ENTRY : "contains"
    LEDGER_ENTRY ||--|{ LEDGER_LINE : "balanced lines"
    LEDGER_ENTRY |o--o| LEDGER_ENTRY : "reverses"

    FOLIO {
        uuid id PK
        uuid reservation_id FK, UK
        char currency "CAD"
        numeric balance "cached, recomputed from lines"
    }
    LEDGER_ENTRY {
        uuid id PK
        uuid folio_id FK
        varchar entry_type
        numeric amount
        char currency "CAD"
        date stay_date "room nights and taxes"
        uuid tax_rate_id FK "US-04"
        numeric rate_applied
        uuid violation_report_id FK "US-16, unique"
        uuid deposit_id FK "US-13"
        uuid night_charge_id FK "US-14"
        varchar external_ref "Stripe id"
        uuid reverses_entry_id FK, UK
        text reason "required for corrections"
        varchar posted_by_type "STAFF or SYSTEM"
        uuid posted_by FK
        timestamptz posted_at
    }
    LEDGER_LINE {
        uuid id PK
        uuid entry_id FK
        varchar account
        numeric debit
        numeric credit
    }
    RESERVATION {
        uuid id PK "US-06"
    }
```

### Design notes
- `CHECK` per entry: the sum of debits equals the sum of credits (deferred constraint trigger).
- Amounts are `numeric(12,2)`; `currency` is `CAD` by `CHECK`.

---

## 3. Event Flow

### 3.1 Posting and split payment — Scenarios 2 and 4

```mermaid
sequenceDiagram
    autonumber
    participant Caller as Posting story (e.g., US-17)
    participant Svc as FolioService
    participant Folio
    participant Rules as PostingRules
    participant Repo as FolioRepository

    Caller->>Svc: post(reservation, STRIPE_CARD, 80.00 CAD)
    Svc->>Repo: load folio
    Svc->>Folio: post(STRIPE_CARD, 80.00)
    Folio->>Rules: lines_for(STRIPE_CARD, 80.00)
    Rules-->>Folio: debit Card (Stripe), credit Guest receivable
    Caller->>Svc: post(reservation, CASH, 20.00 CAD)
    Svc->>Folio: post(CASH, 20.00)
    Svc->>Repo: append entries
    Svc-->>Caller: balance 0.00
```

### 3.2 Correction — Scenarios 5 and 6

```mermaid
flowchart TD
    A[Correction requested] --> B{Actor is the GM?}
    B -- no --> X[403 denied]
    B -- yes --> C{Reason given?}
    C -- no --> Y[422 reason required]
    C -- yes --> D{Void or refund?}
    D -- void --> E[Reversing entry, original kept]
    D -- refund --> F{Stripe or cash?}
    F -- Stripe --> G[Stripe refund, then REFUND_STRIPE entry]
    F -- cash --> H[REFUND_CASH entry]
    E --> Z[Who, when and reason recorded]
    G --> Z
    H --> Z
```

### 3.3 Domain events

| Event | Raised when | Consumers |
|---|---|---|
| `FolioOpened` | Reservation created | — |
| `LedgerEntryPosted` | Any posting | Dashboard balance flag (US-10), reports (US-22, US-23) |
| `LedgerEntryReversed` | GM void | Audit log, reports |
| `RefundIssued` | GM refund | Audit log |
