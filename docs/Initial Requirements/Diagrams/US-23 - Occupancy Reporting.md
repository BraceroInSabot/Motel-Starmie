# US-23 — Occupancy Reporting: Diagrams

> Sources: `US-23-occupancy-reporting.md`, `US-06-reservation-creation-with-secure-card-tokenization.md`, `docs/Business Modeling/Business Modeling.md` (Personas: "yield management, occupancy rates"), `CLAUDE.md`.
> Elements tagged **PENDING** depend on business rules not defined yet. They are placeholders in the design, not decisions.
> Reports are generated per **Property** (Business Modeling, Section 5). Whether a consolidated view is needed is PENDING.

---

## 1. Class Diagram (Clean Architecture)

```mermaid
classDiagram
    direction LR

    namespace Domain {
        class OccupancyInputs {
            <<Value Object>>
            +ReportingPeriod period
            +int available_room_nights
            +int occupied_room_nights
        }
        class OccupancyCalculator {
            <<Interface · Strategy>>
            +calculate(inputs: OccupancyInputs) OccupancyRate
        }
        class RoomNightsOccupancyCalculator {
            <<Strategy · formula PENDING confirmation>>
            +calculate(inputs: OccupancyInputs) OccupancyRate
        }
        class OccupancyRate {
            <<Value Object>>
            +Decimal value
            +as_percentage() Decimal
        }
        class ReportingPeriod {
            <<Value Object · US-22>>
            +date start_local
            +date end_local
        }
    }

    namespace Application {
        class GetOccupancyReportUseCase {
            <<Query Use Case>>
            +execute(property_id: PropertyId, period: ReportingPeriod) OccupancyReport
        }
        class OccupancyReport {
            <<DTO>>
            +ReportingPeriod period
            +int available_room_nights
            +int occupied_room_nights
            +Decimal occupancy_percentage
            +list~DailyOccupancy~ days
        }
        class DailyOccupancy {
            <<DTO>>
            +date stay_date
            +int available
            +int occupied
            +Decimal percentage
        }
        class OccupancyReadModel {
            <<Port · read side>>
            +daily_counts(property_id, start_local, end_local) list~DailyCountRow~
        }
    }

    namespace Infrastructure {
        class PostgresOccupancyReadModel {
            <<Adapter · SQL aggregation>>
        }
    }

    namespace Interface {
        class OccupancyReportView {
            <<REST Controller>>
            +get(request, property_id) Response
        }
        class RequiresPermission {
            <<Authorization Guard · US-01>>
            +check(request, permission: Permission) None
        }
    }

    RoomNightsOccupancyCalculator ..|> OccupancyCalculator
    OccupancyCalculator ..> OccupancyInputs
    OccupancyCalculator ..> OccupancyRate
    OccupancyInputs *-- ReportingPeriod

    GetOccupancyReportUseCase --> OccupancyReadModel
    GetOccupancyReportUseCase --> OccupancyCalculator
    GetOccupancyReportUseCase ..> OccupancyReport
    OccupancyReport *-- DailyOccupancy
    PostgresOccupancyReadModel ..|> OccupancyReadModel

    OccupancyReportView --> RequiresPermission : REPORTS_ACCESS
    OccupancyReportView --> GetOccupancyReportUseCase
```

### Design notes
- **The formula is PENDING, so it sits behind the `OccupancyCalculator` strategy (Open/Closed principle).**
  - `RoomNightsOccupancyCalculator` uses the industry-standard *occupied room-nights ÷ available room-nights*, and is a placeholder until the business confirms the formula.
  - Other indicators, such as ADR or RevPAR, if requested, become new strategies or report fields without changing the use case.
- **Inputs per night:**
  - **available room-nights:** `ROOM_INVENTORY.total_rooms` per room type and night (US-06);
  - **occupied room-nights:** `RESERVATION_NIGHT` rows of reservations that were actually stayed (`IN_HOUSE` or `CHECKED_OUT`);
  - whether Out-of-Order rooms reduce the available count depends on US-19 states that are still PENDING.
- **Precision:** the rate is `Decimal`, and the period is in the property's local dates (stay nights are local calendar dates).
- **Permission:** `REPORTS_ACCESS` (General Manager, US-01).
- **PENDING:**
  - the occupancy formula and other yield indicators (ADR, RevPAR);
  - whether yield management includes dynamic pricing or only reporting;
  - a consolidated view across properties.

---

## 2. ER Diagram (sources of the read model)

```mermaid
erDiagram
    PROPERTY ||--o{ ROOM_INVENTORY : "offers"
    ROOM_TYPE ||--o{ ROOM_INVENTORY : "is counted in"
    RESERVATION ||--|{ RESERVATION_NIGHT : "occupies"
    ROOM_INVENTORY ||--o{ RESERVATION_NIGHT : "is consumed by"

    ROOM_INVENTORY {
        uuid id PK "US-06"
        uuid property_id FK "property filter"
        uuid room_type_id FK
        date stay_date "period filter"
        int total_rooms "available room-nights"
    }
    RESERVATION_NIGHT {
        uuid reservation_id PK, FK "US-06"
        date stay_date PK
        uuid room_inventory_id FK
    }
    RESERVATION {
        uuid id PK "US-06"
        uuid property_id FK
        varchar status "IN_HOUSE or CHECKED_OUT count as occupied"
    }
    ROOM_TYPE {
        uuid id PK "US-02"
    }
    PROPERTY {
        uuid id PK
    }
```

### Design notes
- **No new table.** One aggregation query groups `ROOM_INVENTORY` and the matching `RESERVATION_NIGHT` rows by `stay_date` for the property and period.
- **Index:** `ROOM_INVENTORY (property_id, stay_date)` supports the period filter.

---

## 3. Event Flow

### 3.1 Generating the occupancy report — Scenario 1

```mermaid
sequenceDiagram
    autonumber
    actor GM as General Manager
    participant View as OccupancyReportView<br/>GET /api/v1/properties/{id}/reports/occupancy?from=&to=
    participant UC as GetOccupancyReportUseCase
    participant RM as OccupancyReadModel
    participant Calc as OccupancyCalculator

    GM->>View: GET occupancy for a local period
    View->>UC: execute(property_id, ReportingPeriod)
    UC->>RM: daily_counts(property_id, start, end)
    RM-->>UC: per night: available room-nights, occupied room-nights
    loop each night and the whole period
        UC->>Calc: calculate(OccupancyInputs)
        Calc-->>UC: OccupancyRate (formula PENDING confirmation)
    end
    UC-->>View: OccupancyReport (period total + daily breakdown)
    View-->>GM: 200 OK, occupancy rate for the period
```

### 3.2 Domain events

No domain event is emitted; this story is read-only. It reads the inventory and reservation nights maintained by US-06 and the lifecycle states set by US-11, US-13 and US-17.
