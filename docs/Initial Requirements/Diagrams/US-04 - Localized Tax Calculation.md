# US-04 — Localized Tax Calculation: Diagrams

> Source: `US-04-localized-tax-calculation.md`. Used by US-03 (quotes), US-14 (nightly posting), US-15 (folio), US-17 (invoice) and US-22 (Tax Summary).

## Business rules reflected

| Rule (US-04) | Where it appears |
|---|---|
| Supports GST, HST, PST and municipal levies; modular | `TaxKind`, `TaxRate` rows, `TaxEngine` |
| Defaults (GM can edit): HST 14% NS from 2025-04-01; Halifax Marketing Levy 3% at Bedford and Timberlea | Seed rows in `TAX_RATE` |
| Levy on the nightly rate; HST on the rate plus the rounded levy | `TaxRate.base` (`ROOM_RATE` or `ROOM_RATE_PLUS_PRIOR_TAXES`), `sequence` |
| Only room nights are taxed; fines and fees are not | `TaxEngine` is called only for room nights |
| Per-line rounding to the cent, halves up | `Money.round_half_up()` |
| GM maintains name, area, rate, effective date; changes apply to nights on or after the date; posted amounts never change | `MaintainTaxRateUseCase`, append-only rows, posted entries store the amount |
| The rate used is the one in force on the night's local date | `TaxRateRepository.in_force(area, night)` |
| Each tax on its own line | `TaxLine` list |
| No floats; every amount with value and currency | `Money` (`Decimal` + `Currency`), `numeric(12,2)` + `char(3)` columns |

---

## 1. Class Diagram (Clean Architecture)

```mermaid
classDiagram
    direction LR

    namespace Domain {
        class Money {
            <<Value Object>>
            +Decimal amount
            +Currency currency
            +add(other) Money
            +multiply(rate) Money
            +round_half_up() Money
        }
        class TaxKind {
            <<Enumeration>>
            GST
            HST
            PST
            MUNICIPAL_LEVY
        }
        class TaxBase {
            <<Enumeration>>
            ROOM_RATE
            ROOM_RATE_PLUS_PRIOR_TAXES
        }
        class TaxRate {
            <<Entity>>
            +TaxRateId id
            +str name
            +TaxKind kind
            +str area
            +Decimal rate
            +TaxBase base
            +int sequence
            +date effective_from
        }
        class TaxLine {
            <<Value Object>>
            +str tax_name
            +Decimal rate
            +Money taxable_amount
            +Money amount
        }
        class TaxEngine {
            <<Domain Service>>
            +taxes_for_night(areas, night, room_rate) list~TaxLine~
        }
        class TaxRateRepository {
            <<Port>>
            +in_force(areas, night_local_date) list~TaxRate~
            +add(rate) None
        }
    }

    namespace Application {
        class QuoteTaxesUseCase {
            +execute(property_id, nights) list~TaxLine~
        }
        class MaintainTaxRateUseCase {
            <<SETTINGS · GM>>
            +execute(name, kind, area, rate, base, effective_from) None
        }
        class ListTaxRatesUseCase
    }

    namespace Infrastructure {
        class DjangoTaxRateRepository
    }

    namespace Interface {
        class TaxRateViews {
            <<REST · SETTINGS>>
            /api/v1/tax-rates
        }
    }

    TaxRate --> TaxKind
    TaxRate --> TaxBase
    TaxEngine --> TaxRateRepository
    TaxEngine ..> TaxLine
    TaxLine *-- Money
    QuoteTaxesUseCase --> TaxEngine
    MaintainTaxRateUseCase --> TaxRateRepository
    ListTaxRatesUseCase --> TaxRateRepository
    DjangoTaxRateRepository ..|> TaxRateRepository
    TaxRateViews --> MaintainTaxRateUseCase
    TaxRateViews --> ListTaxRatesUseCase
```

### Design notes
- **Algorithm (per night):** sort the rates in force by `sequence`; for each rate, the taxable amount is the room rate (`ROOM_RATE`) or the room rate plus the already rounded previous taxes (`ROOM_RATE_PLUS_PRIOR_TAXES`); `amount = (taxable × rate).quantize(0.01, ROUND_HALF_UP)`.
- **Verified examples (Scenarios 1 and 2):**
  - $100.00 → levy $3.00; HST 14% × $103.00 = $14.42; total **$117.42**.
  - $89.99 → levy 2.6997 → **$2.70**; HST 14% × $92.69 = 12.9766 → **$12.98**; total **$105.67**.
- **Areas of a property:** its province (`NS`) and its municipality (`Halifax`). Both properties are in the Halifax Regional Municipality, so both get the levy.
- **Rate changes (Scenario 3):** a change is a new row with a later `effective_from`; existing rows are never updated. Posted folio entries store their own amount and rate, so they never change.
- **Not taxed (Scenario 4):** fines (US-16) and cancellation and no-show fees (US-11) never call the engine.

---

## 2. ER Diagram

```mermaid
erDiagram
    TAX_RATE ||--o{ LEDGER_ENTRY : "applied in"

    TAX_RATE {
        uuid id PK
        varchar code "HST, MARKETING_LEVY"
        varchar name
        varchar kind "GST, HST, PST, MUNICIPAL_LEVY"
        varchar area "NS, Halifax"
        numeric rate "e.g., 0.1400"
        varchar base "ROOM_RATE, ROOM_RATE_PLUS_PRIOR_TAXES"
        smallint sequence "levy 1, HST 2"
        date effective_from "UK with code and area"
        uuid created_by FK
        timestamptz created_at
    }
    LEDGER_ENTRY {
        uuid id PK "US-15"
        varchar entry_type "TAX"
        uuid tax_rate_id FK
        numeric rate_applied
        numeric amount
        char currency
        date stay_date
    }
```

---

## 3. Event Flow

### 3.1 Taxes for one night — Scenarios 1 to 3

```mermaid
sequenceDiagram
    autonumber
    participant Caller as Quote or Night Audit
    participant Engine as TaxEngine
    participant Repo as TaxRateRepository

    Caller->>Engine: taxes_for_night(NS and Halifax, night, $100.00 CAD)
    Engine->>Repo: in_force(areas, night local date)
    Repo-->>Engine: Marketing Levy 3% seq 1, HST 14% seq 2
    Engine->>Engine: levy = round_half_up(100.00 x 0.03) = 3.00
    Engine->>Engine: HST = round_half_up((100.00 + 3.00) x 0.14) = 14.42
    Engine-->>Caller: two TaxLines, total with rate = 117.42 CAD
```

### 3.2 GM changes a rate — Scenario 3

```mermaid
flowchart TD
    A[GM saves a new HST rate with an effective date] --> B[New TAX_RATE row]
    B --> C{Night local date on or after the effective date?}
    C -- yes --> D[New rate used for quotes and Night Audit]
    C -- no --> E[Previous rate still used]
    B --> F[Entries already posted keep their amount]
```

### 3.3 Domain events

| Event | Raised when | Consumers |
|---|---|---|
| `TaxRateScheduled` | GM adds a rate with an effective date | Audit log |
