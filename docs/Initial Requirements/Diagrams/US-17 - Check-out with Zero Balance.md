# US-17 — Check-out with Zero Balance: Diagrams

> Source: `US-17-check-out-with-zero-balance.md`. Related: US-06 (kept card), US-10 (late check-out flag), US-11 (early departure refund), US-13 (hold and cash deposit), US-15 (folio), US-16 (fines), US-19 (room Dirty), US-22 (Held Funds report and shared PDF templates).

## Business rules reflected

| Rule (US-17) | Where it appears |
|---|---|
| Check-out by 11:00 AM; later = late check-out flag, no fee | `FlagEvaluator` (US-10); no fee entry |
| Seven steps in order | `CheckOutUseCase`, sequence 3.1 |
| Balance must be $0.00 | Step 4 guard `OutstandingBalance` |
| No card on file: pay at the desk (Stripe fields or cash) | `PayAtDeskUseCase` |
| Partial capture releases the rest of the hold | `PaymentGateway.capture(amount)` releases the remainder |
| Clean stay: whole hold released | Step 5 |
| Stripe unavailable on release: check-out completes, release retried until confirmed | `DEPOSIT.status = RELEASE_PENDING`, `RetryHoldReleasesJob` |
| Invoice: sequential per property; property, guest, dates, nightly charges, taxes per line, fines, payments, refunds, $0.00; PDF in the guest's language | `IssueInvoiceService`, `INVOICE`, WeasyPrint |
| FDA or GM perform check-out; no self check-out | `FRONT_DESK_WORK` permission |

---

## 1. Class Diagram (Clean Architecture)

```mermaid
classDiagram
    direction LR

    namespace Domain {
        class CheckOutPlan {
            <<Domain Service>>
            +fines_to_collect(folio) Money
            +unused_nights(reservation, today_local) list~date~
        }
        class Invoice {
            <<Aggregate Root>>
            +InvoiceId id
            +PropertyId property_id
            +int number
            +ReservationId reservation_id
            +Language language
            +datetime issued_at
        }
        class InvoiceNumberSequence {
            <<Port>>
            +next(property_id) int
        }
    }

    namespace Application {
        class CheckOutUseCase {
            +execute(reservation_id, staff) CheckOutResult
        }
        class PayAtDeskUseCase {
            +execute(reservation_id, method, payment_method_id, staff) None
        }
        class IssueInvoiceService {
            +issue(reservation) Invoice
        }
        class RetryHoldReleasesUseCase {
            +execute() None
        }
        class FolioService {
            <<US-15>>
        }
        class RefundService {
            <<US-11>>
        }
        class PaymentGateway {
            <<Port>>
            +capture(intent_id, amount) CaptureResult
            +release(intent_id) ReleaseResult
            +charge_off_session(customer, pm, amount, key) ChargeResult
        }
        class PdfRenderer {
            <<Port>>
            +render(template, context, language) bytes
        }
        class Notifier {
            <<Port>>
            +invoice(guest, pdf, language) None
        }
        class RealtimePublisher {
            <<Port · US-18>>
        }
    }

    namespace Infrastructure {
        class StripePaymentGateway
        class WeasyPrintPdfRenderer {
            <<HTML templates shared with US-22>>
        }
        class PostgresInvoiceNumberSequence {
            <<row lock per property>>
        }
        class RetryHoldReleasesJob {
            <<cron>>
        }
    }

    namespace Interface {
        class CheckOutViews {
            <<REST · FRONT_DESK_WORK>>
            POST /api/v1/reservations/id/check-out
            POST /api/v1/reservations/id/desk-payments
            GET /api/v1/invoices/id/pdf
        }
    }

    CheckOutUseCase --> CheckOutPlan
    CheckOutUseCase --> FolioService
    CheckOutUseCase --> PaymentGateway
    CheckOutUseCase --> RefundService
    CheckOutUseCase --> IssueInvoiceService
    CheckOutUseCase --> RealtimePublisher
    IssueInvoiceService --> InvoiceNumberSequence
    IssueInvoiceService --> PdfRenderer
    IssueInvoiceService --> Notifier
    IssueInvoiceService ..> Invoice
    PayAtDeskUseCase --> FolioService
    PayAtDeskUseCase --> PaymentGateway
    RetryHoldReleasesUseCase --> PaymentGateway
    RetryHoldReleasesJob --> RetryHoldReleasesUseCase
    StripePaymentGateway ..|> PaymentGateway
    WeasyPrintPdfRenderer ..|> PdfRenderer
    PostgresInvoiceNumberSequence ..|> InvoiceNumberSequence
    CheckOutViews --> CheckOutUseCase
    CheckOutViews --> PayAtDeskUseCase
```

### Design notes
- **Step 1 – fines:** unpaid fines (balance owed, US-16) are captured from the card hold (`DEPOSIT_CAPTURED` entry, up to the hold amount) or deducted from the cash deposit (`CASH` payment from the deposit).
- **Step 2 – remainder:** any balance still owed is charged off-session to the card kept by Stripe (`STRIPE_CARD`). Guests with no kept card (OTA, cash walk-ins) must pay at the desk first (`PayAtDeskUseCase`, Stripe fields or cash).
- **Step 3 – early departure:** nights from today to the original check-out date were prepaid but never charged by the Night Audit; their rate and taxes are refunded through Stripe (`REFUND_STRIPE`) and released from inventory (Scenario 5).
- **Step 4 – zero balance:** if the balance is not $0.00 (e.g., the step 2 charge was declined), the use case stops with `OutstandingBalance` and nothing after step 4 runs (Scenario 2).
- **Step 5 – release:** a captured hold releases its remainder automatically (Scenario 4: capture $250 of $300 → $50 released); an untouched hold is released. If Stripe is unreachable, the deposit is set to `RELEASE_PENDING` and the check-out continues (Scenario 6); `RetryHoldReleasesJob` retries until Stripe confirms. A cash deposit is returned in cash minus fines (`CASH_DEPOSIT_RETURNED`).
- **Step 6:** reservation `IN_HOUSE → CHECKED_OUT` (US-11), room `OCCUPIED → DIRTY` (US-19), pushed to the housekeeping board (US-18).
- **Step 7:** the invoice number comes from a per-property sequence (row lock, no gaps); the PDF is rendered with WeasyPrint in the guest's language and emailed after commit.

---

## 2. ER Diagram

```mermaid
erDiagram
    PROPERTY ||--o{ INVOICE : "issues"
    RESERVATION ||--o| INVOICE : "invoiced by"
    RESERVATION ||--o{ DEPOSIT : "secured by"
    RESERVATION ||--|| FOLIO : "has"

    PROPERTY {
        uuid id PK "US-02"
        int next_invoice_number "sequence per property"
    }
    INVOICE {
        uuid id PK
        uuid property_id FK
        int number "UK with property_id"
        uuid reservation_id FK, UK
        char language "EN or FR"
        varchar pdf_file_key
        timestamptz issued_at
    }
    DEPOSIT {
        uuid id PK "US-13"
        varchar status "RELEASE_PENDING retried"
        int release_attempts
        text last_error
    }
    RESERVATION {
        uuid id PK "US-06"
        timestamptz checked_out_at
        uuid checked_out_by FK
    }
    FOLIO {
        uuid id PK "US-15"
        numeric balance "must be 0.00"
    }
```

---

## 3. Event Flow

### 3.1 The seven check-out steps — Scenarios 1, 2, 4, 5 and 6

```mermaid
sequenceDiagram
    autonumber
    actor FDA as Front Desk Agent or GM
    participant UC as CheckOutUseCase
    participant Folio as FolioService
    participant Pay as PaymentGateway
    participant Refund as RefundService
    participant Inv as IssueInvoiceService

    FDA->>UC: Check-out
    UC->>Folio: 1. unpaid fines
    opt fines owed
        UC->>Pay: capture from the hold (or deduct from the cash deposit)
    end
    opt balance still owed
        UC->>Pay: 2. charge remainder to the kept card
    end
    opt early departure
        UC->>Refund: 3. refund unused prepaid nights
    end
    UC->>Folio: 4. balance is 0.00?
    alt balance not zero
        UC-->>FDA: 409 blocked, guest pays at the desk
    else zero balance
        alt card hold
            UC->>Pay: 5. release the rest of the hold
            Note over UC,Pay: if Stripe is unavailable, RELEASE_PENDING<br/>and the job retries until confirmed
        else cash deposit
            UC->>Folio: 5. CASH_DEPOSIT_RETURNED (deposit minus fines)
        end
        UC->>UC: 6. reservation CHECKED_OUT, room DIRTY
        UC->>Inv: 7. invoice number, PDF in guest language, email
        UC-->>FDA: 200 checked out
    end
```

### 3.2 Domain events

| Event | Raised when | Consumers |
|---|---|---|
| `DepositCaptured` | Fine captured from the hold | Folio (US-15) |
| `DepositReleaseFailed` | Stripe unavailable on release | Retry job, Held Funds report (US-22) |
| `DepositReleased` | Stripe confirms | Held Funds report clears the line |
| `GuestCheckedOut` | Step 6 | Room state (US-19), housekeeping board (US-18), dashboard (US-10) |
| `InvoiceIssued` | Step 7 | Guest email |
