# US-22 — Night Audit and Tax Reports: Diagrams

> Sources: `US-22-night-audit-and-tax-reports.md`, `US-14-night-audit-end-of-day.md`, `US-15-folio-ledger.md`, `US-04-localized-tax-calculation.md`, `docs/Business Modeling/Business Modeling.md` (Personas, Section 4), `CLAUDE.md`.
> Elements tagged **PENDING** depend on business rules not defined yet. They are placeholders in the design, not decisions.
> Reports are generated per **Property** (Business Modeling, Section 5). Whether consolidated reports are needed is PENDING.

---

## 1. Class Diagram (Clean Architecture)

```mermaid
classDiagram
    direction LR

    namespace Domain {
        class ReportingPeriod {
            <<Value Object>>
            +date start_local
            +date end_local
            +to_utc_range(timezone: Timezone) tuple~datetime, datetime~
        }
        class TaxCode {
            <<Enumeration · US-04>>
            GST
            HST
            PST
        }
        class Money {
            <<Value Object · US-04>>
            +Decimal amount
            +Currency currency
        }
    }

    namespace Application {
        class GetNightAuditReportUseCase {
            <<Query Use Case>>
            +execute(property_id: PropertyId, business_date: date) NightAuditReport
        }
        class GetTaxSummaryUseCase {
            <<Query Use Case>>
            +execute(property_id: PropertyId, period: ReportingPeriod) TaxSummary
        }
        class NightAuditReport {
            <<DTO>>
            +date business_date
            +str run_status
            +datetime started_at_local
            +list~NightAuditReportLine~ lines
            +Money total_room_revenue
            +dict~TaxCode, Money~ total_taxes
        }
        class NightAuditReportLine {
            <<DTO>>
            +str reservation_code
            +str room_number
            +Money room_charge
            +dict~TaxCode, Money~ taxes
        }
        class TaxSummary {
            <<DTO>>
            +ReportingPeriod period
            +dict~TaxCode, Money~ totals
        }
        class FinancialReportReadModel {
            <<Port · read side>>
            +night_audit_lines(property_id, business_date) list~Row~
            +tax_totals(property_id, start_utc, end_utc) list~Row~
        }
        class PropertyRepository {
            <<Port>>
            +get_by_id(property_id) Property
        }
        class ReportExporter {
            <<Port · formats PENDING>>
            +export(report, format: str) bytes
        }
    }

    namespace Infrastructure {
        class PostgresFinancialReportReadModel {
            <<Adapter · SQL aggregations>>
        }
    }

    namespace Interface {
        class NightAuditReportView {
            <<REST Controller>>
            +get(request, property_id, business_date) Response
        }
        class TaxSummaryView {
            <<REST Controller>>
            +get(request, property_id) Response
        }
        class RequiresPermission {
            <<Authorization Guard · US-01>>
            +check(request, permission: Permission) None
        }
    }

    GetNightAuditReportUseCase --> FinancialReportReadModel
    GetNightAuditReportUseCase --> PropertyRepository
    GetNightAuditReportUseCase ..> NightAuditReport
    NightAuditReport *-- NightAuditReportLine
    GetTaxSummaryUseCase --> FinancialReportReadModel
    GetTaxSummaryUseCase --> PropertyRepository
    GetTaxSummaryUseCase ..> ReportingPeriod
    GetTaxSummaryUseCase ..> TaxSummary
    TaxSummary ..> TaxCode
    PostgresFinancialReportReadModel ..|> FinancialReportReadModel

    NightAuditReportView --> RequiresPermission : FINANCIAL_DATA_ACCESS
    TaxSummaryView --> RequiresPermission : FINANCIAL_DATA_ACCESS
    NightAuditReportView --> GetNightAuditReportUseCase
    TaxSummaryView --> GetTaxSummaryUseCase
    NightAuditReportView ..> ReportExporter : optional export
    TaxSummaryView ..> ReportExporter : optional export
```

### Design notes
- **Read side only:** reports are queries over data already posted by the Night Audit (US-14) and the folio ledger (US-15). Nothing is recalculated, so the reports always match what was charged.
- **Night Audit report (Scenario 1):** it lists the folio transactions linked to the `NIGHT_AUDIT_RUN` of the property and business date, with room charges and taxes per reservation, plus totals.
- **Tax summary (Scenario 2):**
  - it sums the `TAX_PAYABLE` ledger lines grouped by `tax_code` (GST/HST/PST) for a period;
  - `ReportingPeriod.to_utc_range` converts the local start and end dates to a UTC interval using the property's timezone, because timestamps are stored in UTC;
  - this includes the DST days, which are not 24 hours long.
- **Display:** amounts are shown in CAD as `Money` (`Decimal`) and times in the property's local timezone.
- **Permission:** both endpoints require `FINANCIAL_DATA_ACCESS` (General Manager, US-01).
- **PENDING:**
  - detailed content, layout and export formats (`ReportExporter`);
  - consolidated reports across properties.

---

## 2. ER Diagram (sources of the read model)

```mermaid
erDiagram
    PROPERTY ||--o{ NIGHT_AUDIT_RUN : "runs"
    NIGHT_AUDIT_RUN ||--o{ FOLIO_TRANSACTION : "posts"
    FOLIO ||--o{ FOLIO_TRANSACTION : "records"
    FOLIO_TRANSACTION ||--|{ LEDGER_LINE : "is made of"
    RESERVATION ||--|| FOLIO : "has"

    NIGHT_AUDIT_RUN {
        uuid id PK "US-14"
        uuid property_id FK
        date business_date
        varchar status
        timestamptz started_at "UTC"
    }
    FOLIO_TRANSACTION {
        uuid id PK "US-15"
        uuid folio_id FK
        uuid night_audit_run_id FK
        varchar transaction_type
        timestamptz posted_at "UTC, period filter"
    }
    LEDGER_LINE {
        uuid id PK "US-15"
        uuid transaction_id FK
        varchar account_code "TAX_PAYABLE for taxes"
        varchar tax_code "GST, HST, PST"
        numeric credit_amount "numeric(12,2)"
        char currency
    }
    FOLIO {
        uuid id PK "US-15"
        uuid reservation_id FK
    }
    RESERVATION {
        uuid id PK "US-06"
        uuid property_id FK "property filter"
        varchar confirmation_code
    }
    PROPERTY {
        uuid id PK
        varchar timezone "IANA, used for local periods"
    }
```

### Design notes
- **No new table.** Indexes support the two queries: `FOLIO_TRANSACTION (night_audit_run_id)`, `FOLIO_TRANSACTION (posted_at)` and `LEDGER_LINE (account_code, tax_code)`.
- **Tax corrections:** the tax summary uses `SUM(credit_amount) - SUM(debit_amount)` on `TAX_PAYABLE`, so future reversing entries (corrections, PENDING in US-15) are netted automatically.

---

## 3. Event Flow

### 3.1 Night Audit report — Scenario 1

```mermaid
sequenceDiagram
    autonumber
    actor GM as General Manager
    participant View as NightAuditReportView<br/>GET /api/v1/properties/{id}/reports/night-audit/{business_date}
    participant UC as GetNightAuditReportUseCase
    participant RM as FinancialReportReadModel

    GM->>View: GET report for a business date
    View->>UC: execute(property_id, business_date)
    UC->>RM: night_audit_lines(property_id, business_date)
    alt No run for that date
        RM-->>UC: no run
        UC-->>View: not found
        View-->>GM: 404 Not Found
    else Run found
        RM-->>UC: room charges and tax lines per reservation
        UC->>UC: totals per tax code (Decimal), local times
        UC-->>View: NightAuditReport
        View-->>GM: 200 OK, charges and taxes posted in that run (CAD)
    end
```

### 3.2 Tax summary — Scenario 2

```mermaid
sequenceDiagram
    autonumber
    actor GM as General Manager
    participant View as TaxSummaryView<br/>GET /api/v1/properties/{id}/reports/tax-summary?from=&to=
    participant UC as GetTaxSummaryUseCase
    participant Props as PropertyRepository
    participant RM as FinancialReportReadModel

    GM->>View: GET tax summary for a local period
    View->>UC: execute(property_id, ReportingPeriod)
    UC->>Props: get_by_id(property_id)
    Props-->>UC: Property (America/Halifax)
    UC->>UC: period.to_utc_range(timezone), DST-aware
    UC->>RM: tax_totals(property_id, start_utc, end_utc)
    RM-->>UC: totals grouped by tax_code
    UC-->>View: TaxSummary {GST, HST, PST}
    View-->>GM: 200 OK, totals per tax type in CAD
```

### 3.3 Domain events

No domain event is emitted; this story is read-only. It consumes the data produced by `NightAuditCompleted` (US-14) and `ChargePosted` (US-15).
