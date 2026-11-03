# US-23 — Occupancy Reporting: Diagrams

> Source: `US-23-occupancy-reporting.md`. Related: US-14 (nights charged), US-15 (voids), US-19 (room state history), US-22 (header and export).

## Business rules reflected

| Rule (US-23) | Where it appears |
|---|---|
| Occupancy % = occupied ÷ available room-nights × 100, 1 decimal | `OccupancyMetrics.occupancy()` |
| Available room-nights per night: active rooms minus rooms Unavailable or Maintenance at the 2:00 AM Night Audit (from room history) | `AvailableRoomNightsQuery` on `ROOM_STATE_HISTORY` |
| Occupied room-nights: nights charged by the Night Audit, excluding voids; No-Show and Canceled not counted | `NIGHT_CHARGE` + non-voided `ROOM_NIGHT` entries |
| ADR = room revenue ÷ occupied room-nights | `OccupancyMetrics.adr()` |
| RevPAR = room revenue ÷ available room-nights | `OccupancyMetrics.revpar()` |
| Revenue excludes taxes; CAD; rounded to the cent, halves up | `ROOM_NIGHT` entries only; `Money.round_half_up()` |
| "N/A" when there is nothing to divide by | `Optional` result → "N/A" |
| Any date range; totals, daily breakdown and by room type | `OccupancyReport` DTO |
| No dynamic pricing | Read-only report |
| GM only, one property at a time, same header and PDF/CSV export as US-22 | `FINANCIAL_REPORTS`, `ReportHeader`, `ExportReportUseCase` |

---

## 1. Class Diagram (Clean Architecture)

```mermaid
classDiagram
    direction LR

    namespace Domain {
        class RoomNightCounts {
            <<Value Object>>
            +int available
            +int occupied
            +Money room_revenue
        }
        class OccupancyMetrics {
            <<Domain Service>>
            +occupancy(counts) Decimal
            +adr(counts) Money
            +revpar(counts) Money
        }
        class ReportingPeriod {
            <<Value Object>>
            +date start_local
            +date end_local
        }
    }

    namespace Application {
        class GetOccupancyReportUseCase {
            <<Query Use Case>>
            +execute(property_id, period) OccupancyReport
        }
        class OccupancyReport {
            <<DTO>>
            +ReportHeader header
            +OccupancyLine totals
            +list~OccupancyLine~ by_day
            +list~OccupancyLine~ by_room_type
        }
        class OccupancyLine {
            <<DTO>>
            +str label
            +int available_room_nights
            +int occupied_room_nights
            +str occupancy_percent
            +str adr
            +str revpar
            +Money room_revenue
        }
        class OccupancyReadModel {
            <<Port>>
            +available_by_night(property_id, period) list~Row~
            +occupied_by_night(property_id, period) list~Row~
        }
        class ExportReportUseCase {
            <<US-22>>
        }
    }

    namespace Infrastructure {
        class PostgresOccupancyReadModel {
            <<SQL on room history and night charges>>
        }
    }

    namespace Interface {
        class OccupancyReportView {
            <<REST · FINANCIAL_REPORTS>>
            GET /api/v1/properties/id/reports/occupancy?from=&to=
        }
    }

    OccupancyMetrics ..> RoomNightCounts
    GetOccupancyReportUseCase --> OccupancyReadModel
    GetOccupancyReportUseCase --> OccupancyMetrics
    GetOccupancyReportUseCase ..> ReportingPeriod
    GetOccupancyReportUseCase ..> OccupancyReport
    OccupancyReport *-- OccupancyLine
    PostgresOccupancyReadModel ..|> OccupancyReadModel
    OccupancyReportView --> GetOccupancyReportUseCase
    OccupancyReportView --> ExportReportUseCase
```

### Design notes
- **Available room-nights** for night *N*: rooms that are active, minus rooms whose state at the moment of that night's Night Audit (2:00 AM local on *N* + 1, from `ROOM_STATE_HISTORY`) was `UNAVAILABLE` or `MAINTENANCE`.
- **Occupied room-nights** for night *N*: `NIGHT_CHARGE` rows with `stay_date = N` whose `ROOM_NIGHT` entry has not been voided. No-Show and Canceled reservations are never charged by the audit, so they are naturally excluded.
- **Room revenue:** sum of non-voided `ROOM_NIGHT` amounts (no taxes).
- **Verified example (Scenario 2):** 20 active rooms, 2 in Maintenance → 18 available; 9 occupied; $900.00 → occupancy 50.0%, ADR $100.00, RevPAR $50.00.
- **Division by zero:** if available or occupied room-nights are 0, the corresponding value is "N/A".
- **By room type:** the same counts grouped by the room type of the room (available) and of the reservation (occupied).

---

## 2. ER Diagram (sources of the read model)

```mermaid
erDiagram
    ROOM ||--o{ ROOM_STATE_HISTORY : "records"
    ROOM_TYPE ||--o{ ROOM : "templates"
    RESERVATION ||--o{ NIGHT_CHARGE : "charged for"
    NIGHT_CHARGE ||--|{ LEDGER_ENTRY : "posts"

    ROOM {
        uuid id PK "US-02"
        uuid property_id FK
        uuid room_type_id FK
        boolean is_active
    }
    ROOM_STATE_HISTORY {
        uuid id PK "US-19"
        uuid room_id FK
        varchar to_state
        timestamptz changed_at "state at 2:00 AM"
    }
    NIGHT_CHARGE {
        uuid id PK "US-14"
        uuid reservation_id FK
        date stay_date
    }
    LEDGER_ENTRY {
        uuid id PK "US-15"
        varchar entry_type "ROOM_NIGHT"
        numeric amount "room revenue, no taxes"
        uuid reverses_entry_id "voids excluded"
    }
    RESERVATION {
        uuid id PK "US-06"
        uuid room_type_id FK
    }
    ROOM_TYPE {
        uuid id PK "US-02"
    }
```

---

## 3. Event Flow

### 3.1 Generating the report — Scenarios 1 to 4

```mermaid
sequenceDiagram
    autonumber
    actor GM as General Manager
    participant View as OccupancyReportView
    participant UC as GetOccupancyReportUseCase
    participant RM as OccupancyReadModel
    participant Metrics as OccupancyMetrics

    GM->>View: GET occupancy (property, from, to)
    View->>UC: execute(property_id, period)
    UC->>RM: available_by_night (room history at 2:00 AM)
    UC->>RM: occupied_by_night (charged, not voided)
    loop period total, each day, each room type
        UC->>Metrics: occupancy, ADR, RevPAR (N/A on division by zero)
    end
    UC-->>View: OccupancyReport
    View-->>GM: report, or PDF/CSV export (US-22)
```

### 3.2 Domain events

None. The report is read-only.
