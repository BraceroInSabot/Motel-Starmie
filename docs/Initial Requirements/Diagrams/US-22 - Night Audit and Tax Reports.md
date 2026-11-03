# US-22 — Night Audit, Tax Summary and Held Funds Reports: Diagrams

> Source: `US-22-night-audit-and-tax-reports.md`. Related: US-01 (GM-only reports), US-04 (taxes), US-11 (failed refunds), US-14 (Night Audit runs and exceptions), US-17 (pending hold releases, shared PDF templates), US-23 (same header and export).

## Business rules reflected

| Rule (US-22) | Where it appears |
|---|---|
| Amounts in CAD; dates and times in the property's timezone (stored in UTC) | `ReportFormatter` |
| One property at a time; the GM switches; no combined report | `property_id` in every route |
| Night Audit report content (run status and times, reservations charged, room revenue, taxes per type, total, detail lines, exceptions list) | `NightAuditReport` DTO |
| Tax Summary content (per tax and rate: taxable amount, tax collected, transactions; monthly breakdown for periods over one month); fines and fees not taxed | `TaxSummaryReport` DTO |
| Held Funds report (GM only): Checked-Out, Canceled or No-Show reservations with an unreleased hold, a failed card refund or an owed cash refund | `HeldFundsReadModel` |
| Cash refund lines have no action; they leave the report when paid at the desk (US-11) | `REFUND.method = CASH`, `status = OWED` |
| Held Funds columns: code, guest, reservation status, amount, type, since, status, who acted and when | `HeldFundsLine` DTO |
| "Release now" and "Retry refund" act immediately through Stripe and are audit-logged | `ReleaseHoldNowUseCase`, `RetryRefundUseCase` |
| Common header, summary totals, sortable and filterable detail table | `ReportHeader`, front-end table |
| PDF and CSV export; PDFs with WeasyPrint from HTML templates shared with the invoice | `PdfRenderer`, `CsvRenderer` |

---

## 1. Class Diagram (Clean Architecture)

```mermaid
classDiagram
    direction LR

    namespace Application {
        class ReportHeader {
            <<DTO>>
            +str property_name
            +str report_name
            +str business_date_or_period
            +datetime generated_at_local
            +str generated_by
        }
        class NightAuditReport {
            <<DTO>>
            +ReportHeader header
            +RunStatus status
            +datetime started_at
            +datetime finished_at
            +int reservations_charged
            +Money room_revenue
            +dict taxes_by_type
            +Money total_posted
            +list~NightAuditLine~ lines
            +list~ExceptionLine~ exceptions
        }
        class TaxSummaryReport {
            <<DTO>>
            +ReportHeader header
            +list~TaxSummaryLine~ lines
            +list~MonthlyTaxLine~ by_month
        }
        class TaxSummaryLine {
            <<DTO>>
            +str tax_name
            +Decimal rate
            +Money taxable_amount
            +Money tax_collected
            +int transactions
        }
        class HeldFundsReport {
            <<DTO>>
            +ReportHeader header
            +Money total_held
            +list~HeldFundsLine~ lines
        }
        class HeldFundsLine {
            <<DTO>>
            +str confirmation_code
            +str guest_name
            +ReservationStatus reservation_status
            +Money amount
            +HeldFundsType type
            +datetime since
            +str status
            +str last_action_by
            +datetime last_action_at
        }
        class GetNightAuditReportUseCase
        class GetTaxSummaryUseCase
        class GetHeldFundsReportUseCase
        class ReleaseHoldNowUseCase {
            +execute(deposit_id, gm) None
        }
        class RetryRefundUseCase {
            +execute(refund_id, gm) None
        }
        class ExportReportUseCase {
            +execute(report, format) bytes
        }
        class ReportReadModel {
            <<Port>>
        }
        class PaymentGateway {
            <<Port>>
        }
        class PdfRenderer {
            <<Port>>
        }
        class CsvRenderer {
            <<Port>>
        }
        class AuditLog {
            <<Port>>
        }
    }

    namespace Domain {
        class HeldFundsType {
            <<Enumeration>>
            DEPOSIT_HOLD
            CARD_REFUND
            CASH_REFUND
        }
    }

    namespace Infrastructure {
        class PostgresReportReadModel
        class WeasyPrintPdfRenderer {
            <<shared templates with the invoice>>
        }
        class PythonCsvRenderer
        class StripePaymentGateway
    }

    namespace Interface {
        class ReportViews {
            <<REST>>
            GET /api/v1/properties/id/reports/night-audit?date=
            GET /api/v1/properties/id/reports/tax-summary?from=&to=
            GET /api/v1/properties/id/reports/held-funds
            Accept or format=pdf or csv
        }
        class HeldFundsActionViews {
            <<REST · FINANCIAL_REPORTS>>
            POST /api/v1/deposits/id/release
            POST /api/v1/refunds/id/retry
        }
    }

    NightAuditReport *-- ReportHeader
    TaxSummaryReport *-- ReportHeader
    TaxSummaryReport *-- TaxSummaryLine
    HeldFundsReport *-- ReportHeader
    HeldFundsReport *-- HeldFundsLine
    HeldFundsLine --> HeldFundsType
    GetNightAuditReportUseCase --> ReportReadModel
    GetTaxSummaryUseCase --> ReportReadModel
    GetHeldFundsReportUseCase --> ReportReadModel
    ReleaseHoldNowUseCase --> PaymentGateway
    ReleaseHoldNowUseCase --> AuditLog
    RetryRefundUseCase --> PaymentGateway
    RetryRefundUseCase --> AuditLog
    ExportReportUseCase --> PdfRenderer
    ExportReportUseCase --> CsvRenderer
    PostgresReportReadModel ..|> ReportReadModel
    WeasyPrintPdfRenderer ..|> PdfRenderer
    PythonCsvRenderer ..|> CsvRenderer
    StripePaymentGateway ..|> PaymentGateway
    ReportViews --> GetNightAuditReportUseCase
    ReportViews --> GetTaxSummaryUseCase
    ReportViews --> GetHeldFundsReportUseCase
    ReportViews --> ExportReportUseCase
    HeldFundsActionViews --> ReleaseHoldNowUseCase
    HeldFundsActionViews --> RetryRefundUseCase
```

### Design notes
- **Permissions (US-01 default matrix):** Night Audit report → `NIGHT_AUDIT_REPORT`; Tax Summary and Held Funds → `FINANCIAL_REPORTS`. Both are GM-only by default; Housekeepers can never receive them.
- **Night Audit report** reads `NIGHT_AUDIT_RUN`, its `NIGHT_CHARGE` rows and ledger entries, and `NIGHT_AUDIT_EXCEPTION` (US-14) for one business date.
- **Tax Summary** groups `TAX_*` ledger entries by tax and `rate_applied` for the period (net of voids); the taxable amount is the sum of the `ROOM_NIGHT` amounts (plus the rounded levy for HST, per US-04); the monthly breakdown appears when the period spans more than one month.
- **Held Funds** lists `DEPOSIT` rows with status `HELD` or `RELEASE_PENDING` on reservations that are `CHECKED_OUT`, `CANCELED` or `NO_SHOW`, plus `REFUND` rows with method `CARD` and status `FAILED`, and rows with method `CASH` and status `OWED` (no action button; they disappear when a Front Desk Agent or the GM pays the guest at the desk, US-11). "Since" is the check-out or failure time. "Release now" and "Retry refund" call Stripe immediately; success clears the line, failure updates its status; both write an audit entry.
- **Guest name** is decrypted for display; anonymized guests (US-21) show a placeholder such as "Anonymized guest".
- **Exports** use the same DTO: CSV for the table, PDF through the shared HTML templates and WeasyPrint. Exports are excluded from the 1.5 s performance rule (US-10).

---

## 2. ER Diagram (sources of the read model)

```mermaid
erDiagram
    NIGHT_AUDIT_RUN ||--o{ NIGHT_CHARGE : "posts"
    NIGHT_AUDIT_RUN ||--o{ NIGHT_AUDIT_EXCEPTION : "lists"
    NIGHT_CHARGE ||--|{ LEDGER_ENTRY : "room night and taxes"
    TAX_RATE ||--o{ LEDGER_ENTRY : "applied in"
    RESERVATION ||--o{ DEPOSIT : "held funds"
    RESERVATION ||--o{ REFUND : "held funds"

    NIGHT_AUDIT_RUN {
        uuid id PK "US-14"
        uuid property_id FK
        date business_date
        varchar status
        timestamptz started_at
        timestamptz finished_at
    }
    NIGHT_CHARGE {
        uuid id PK "US-14"
        uuid reservation_id FK
        date stay_date
    }
    NIGHT_AUDIT_EXCEPTION {
        uuid id PK "US-14"
        uuid reservation_id FK
        text error
    }
    LEDGER_ENTRY {
        uuid id PK "US-15"
        varchar entry_type "ROOM_NIGHT, TAX_HST, TAX_MARKETING_LEVY"
        numeric amount
        numeric rate_applied
        uuid reverses_entry_id "voids excluded"
        timestamptz posted_at
    }
    TAX_RATE {
        uuid id PK "US-04"
        varchar name
    }
    DEPOSIT {
        uuid id PK "US-13"
        varchar status "HELD or RELEASE_PENDING listed"
        numeric amount
    }
    REFUND {
        uuid id PK "US-11"
        varchar method "CARD or CASH"
        varchar status "CARD FAILED or CASH OWED listed"
        numeric amount
    }
    RESERVATION {
        uuid id PK "US-06"
        varchar status "CHECKED_OUT, CANCELED, NO_SHOW"
    }
```

---

## 3. Event Flow

### 3.1 Held Funds actions — Scenarios 3 and 4

```mermaid
sequenceDiagram
    autonumber
    actor GM as General Manager
    participant View as HeldFundsActionViews
    participant Release as ReleaseHoldNowUseCase
    participant Retry as RetryRefundUseCase
    participant Pay as PaymentGateway
    participant Audit as AuditLog

    alt Release now (deposit hold)
        GM->>View: POST /deposits/{id}/release
        View->>Release: execute(deposit_id, gm)
        Release->>Pay: release(payment intent)
        alt Stripe confirms
            Release->>Release: deposit RELEASED, line removed
        else Stripe fails
            Release->>Release: status updated, line stays
        end
        Release->>Audit: HOLD_RELEASE_REQUESTED (who, when, result)
    else Retry refund
        GM->>View: POST /refunds/{id}/retry
        View->>Retry: execute(refund_id, gm)
        Retry->>Pay: refund(charge, amount, same idempotency key)
        Retry->>Audit: REFUND_RETRIED (who, when, result)
    end
    View-->>GM: report refreshed
```

### 3.2 Viewing and exporting — Scenarios 1, 2 and 5

```mermaid
flowchart TD
    A[GM selects property and report] --> B{Report}
    B -- Night Audit --> C[Business date]
    B -- Tax Summary --> D[Period]
    B -- Held Funds --> E[Current state]
    C --> F[Header, summary totals, sortable and filterable table]
    D --> F
    E --> F
    F --> G{Export?}
    G -- PDF --> H[WeasyPrint, shared HTML templates]
    G -- CSV --> I[Same columns as the table]
```

### 3.3 Domain events

| Event | Raised when | Consumers |
|---|---|---|
| `HoldReleaseRequested` | GM presses "Release now" | Audit log |
| `RefundRetried` | GM presses "Retry refund" | Audit log |
