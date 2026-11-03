# US-10 — Front Desk Dashboard: Diagrams

> Source: `US-10-front-desk-dashboard.md`. Related: US-06 (Unconfirmed), US-12 (ID, early check-in), US-13 (deposit), US-16 (violation reports), US-17 (balance), US-18 (live room states).

## Business rules reflected

| Rule (US-10) | Where it appears |
|---|---|
| Lists for the agent's property and today (local date): Arrivals, In-House, Departures, Unconfirmed, open violation reports | `DashboardSnapshot` sections |
| Flags: missing deposit, missing ID, early check-in approval needed, Unconfirmed, outstanding balance on departure, late check-out | `RequirementFlag`, `FlagEvaluator` |
| Auto-refresh every 60 s plus a refresh key | `useDashboard` polling, key `R` |
| Shortcuts: ↑/↓, Enter, C, /, R, Esc | `DashboardKeyboardMap` |
| Search by guest name, confirmation code or room number | `SearchReservationsUseCase` |
| Agent sees own property; GM chooses | `PropertyScope` (US-01) |
| API ≤ 1.5 s for 95% of requests (exports and external services excluded) | Read model with indexes; performance test |

---

## 1. Class Diagram (Clean Architecture)

```mermaid
classDiagram
    direction LR

    namespace Domain {
        class RequirementFlag {
            <<Enumeration>>
            MISSING_DEPOSIT
            MISSING_ID_VERIFICATION
            EARLY_CHECK_IN_APPROVAL_NEEDED
            UNCONFIRMED
            OUTSTANDING_BALANCE
            LATE_CHECK_OUT
        }
        class FlagEvaluator {
            <<Domain Service>>
            +CHECK_IN_FROM = 16:00
            +CHECK_OUT_BY = 11:00
            +flags(row, now_local) set~RequirementFlag~
        }
    }

    namespace Application {
        class GetDashboardUseCase {
            <<Query Use Case>>
            +execute(staff, property_id) DashboardSnapshot
        }
        class SearchReservationsUseCase {
            <<Query Use Case>>
            +execute(staff, property_id, text) list~DashboardRow~
        }
        class DashboardSnapshot {
            <<DTO>>
            +date business_date
            +list~DashboardRow~ arrivals
            +list~DashboardRow~ in_house
            +list~DashboardRow~ departures
            +list~DashboardRow~ unconfirmed
            +list~ViolationRow~ open_violations
        }
        class DashboardRow {
            <<DTO>>
            +str confirmation_code
            +str guest_name
            +str room_number
            +str room_type
            +ReservationStatus status
            +set~RequirementFlag~ flags
        }
        class DashboardReadModel {
            <<Port>>
            +rows(property_id, business_date) list~ReservationFacts~
            +open_violations(property_id) list~ViolationRow~
            +search(property_id, text) list~ReservationFacts~
        }
        class Clock {
            <<Port>>
        }
    }

    namespace Infrastructure {
        class PostgresDashboardReadModel {
            <<Adapter · SQL with indexes>>
        }
    }

    namespace Interface {
        class DashboardViews {
            <<REST · FRONT_DESK_WORK>>
            GET /api/v1/properties/id/dashboard
            GET /api/v1/properties/id/reservations?q=
        }
        class RoomStateConsumer {
            <<WebSocket · US-18>>
            ws /ws/properties/id/rooms
        }
    }

    namespace FrontEnd {
        class FrontDeskDashboard {
            <<React · MantineUI>>
            +refetch every 60 s
            +keys Up Down Enter C slash R Esc
        }
    }

    GetDashboardUseCase --> DashboardReadModel
    GetDashboardUseCase --> FlagEvaluator
    GetDashboardUseCase --> Clock
    GetDashboardUseCase ..> DashboardSnapshot
    DashboardSnapshot *-- DashboardRow
    DashboardRow --> RequirementFlag
    SearchReservationsUseCase --> DashboardReadModel
    PostgresDashboardReadModel ..|> DashboardReadModel
    DashboardViews --> GetDashboardUseCase
    DashboardViews --> SearchReservationsUseCase
    FrontDeskDashboard ..> DashboardViews : poll 60 s
    FrontDeskDashboard ..> RoomStateConsumer : live room states
```

### Design notes
- **Flag rules (`FlagEvaluator`):**
  - `MISSING_DEPOSIT`: arrival or In-House without an authorized card hold and without a cash deposit (US-13).
  - `MISSING_ID_VERIFICATION`: arrival without a successful ID check (US-12).
  - `EARLY_CHECK_IN_APPROVAL_NEEDED`: arrival, local time before 4:00 PM, no approval (US-12).
  - `UNCONFIRMED`: status `UNCONFIRMED` (US-06).
  - `OUTSTANDING_BALANCE`: departure with folio balance ≠ $0.00 (US-17).
  - `LATE_CHECK_OUT`: departure still `IN_HOUSE` after 11:00 AM local time.
- **Business date** = the property's local date from the `Clock`.
- **Scope:** a Front Desk Agent's `property_id` must equal their own; the GM can pass any property.
- **Performance:** one query per section, using the indexes below, keeps the request under the 1.5 s p95 target.
- **Room states** on the dashboard also update live through the WebSocket of US-18; the 60-second polling refreshes everything else.

---

## 2. ER Diagram (sources of the read model)

```mermaid
erDiagram
    RESERVATION ||--|| FOLIO : "has"
    RESERVATION ||--o{ DEPOSIT : "secured by"
    RESERVATION ||--o| ID_VERIFICATION : "verified by"
    ROOM ||--o{ VIOLATION_REPORT : "reported in"
    RESERVATION }o--o| ROOM : "assigned"

    RESERVATION {
        uuid id PK "US-06"
        uuid property_id FK
        varchar status
        date check_in_date "index with property_id"
        date check_out_date "index with property_id"
        uuid early_check_in_approved_by FK "US-12"
    }
    DEPOSIT {
        uuid id PK "US-13"
        varchar kind "CARD_HOLD or CASH"
        varchar status
    }
    ID_VERIFICATION {
        uuid reservation_id PK, FK "US-12"
        varchar result
    }
    FOLIO {
        uuid id PK "US-15"
        numeric balance "maintained by the ledger"
    }
    VIOLATION_REPORT {
        uuid id PK "US-16"
        varchar status "OPEN shown"
    }
    ROOM {
        uuid id PK "US-02"
        varchar number
        varchar state
    }
```

---

## 3. Event Flow

### 3.1 Loading, auto-refresh and keyboard — Scenarios 1 to 5

```mermaid
sequenceDiagram
    autonumber
    actor FDA as Front Desk Agent
    participant UI as FrontDeskDashboard
    participant View as DashboardViews
    participant UC as GetDashboardUseCase
    participant RM as DashboardReadModel
    participant Flags as FlagEvaluator

    FDA->>UI: opens the dashboard
    loop on open, every 60 seconds, or key R
        UI->>View: GET /properties/{id}/dashboard
        View->>UC: execute(staff, property_id)
        UC->>RM: rows(property, local business date)
        loop each reservation
            UC->>Flags: flags(row, now local)
        end
        UC-->>UI: Arrivals, In-House, Departures, Unconfirmed, open violations
    end
    FDA->>UI: Up and Down, Enter opens, C starts check-in, slash searches, Esc goes back
```

### 3.2 Domain events

None emitted. The dashboard reads data produced by US-06, US-12, US-13, US-16, US-17 and room-state events from US-19 (pushed through US-18).
