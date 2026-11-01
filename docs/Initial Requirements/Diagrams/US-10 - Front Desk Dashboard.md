# US-10 — Front Desk Dashboard: Diagrams

> Sources: `US-10-front-desk-dashboard.md`, `US-12-check-in-with-age-verification.md`, `US-13-deposit-pre-authorization-hold.md`, `docs/Business Modeling/Business Modeling.md` (Personas, Section 5), `CLAUDE.md`.
> Elements tagged **PENDING** depend on business rules not defined yet. They are placeholders in the design, not decisions.
> Data is scoped per **Property** (Business Modeling, Section 5) even where the story text does not mention it.

---

## 1. Class Diagram (Clean Architecture + Front-end)

```mermaid
classDiagram
    direction LR

    namespace Domain {
        class RequirementFlag {
            <<Enumeration>>
            MISSING_DEPOSIT
            MISSING_ID_VERIFICATION
        }
        class CheckInRequirementsPolicy {
            <<Domain Service>>
            +missing_requirements(snapshot: CheckInSnapshot) set~RequirementFlag~
        }
        class CheckInSnapshot {
            <<Value Object>>
            +ReservationStatus status
            +DepositHoldStatus | None deposit_status
            +IdVerificationResult | None id_result
            +bool age_override
        }
    }

    namespace Application {
        class GetFrontDeskDashboardUseCase {
            <<Query Use Case>>
            +execute(property_id: PropertyId, business_date: date) FrontDeskDashboard
        }
        class FrontDeskDashboard {
            <<DTO>>
            +list~DashboardReservation~ reservations
        }
        class DashboardReservation {
            <<DTO>>
            +UUID reservation_id
            +str guest_name
            +str room_type
            +str | None room_number
            +date check_in_date
            +date check_out_date
            +str status
            +list~str~ flags
        }
        class FrontDeskDashboardReadModel {
            <<Port · read side>>
            +reservations_to_handle(property_id: PropertyId, business_date: date) list~CheckInSnapshotRow~
        }
    }

    namespace Infrastructure {
        class PostgresFrontDeskDashboardReadModel {
            <<Adapter · single SQL query / view>>
        }
    }

    namespace Interface {
        class FrontDeskDashboardView {
            <<REST Controller>>
            +get(request, property_id) Response
        }
        class RequiresPermission {
            <<Authorization Guard · US-01>>
            +check(request, permission: Permission) None
        }
    }

    namespace FrontEnd {
        class FrontDeskDashboardPage {
            <<React Component · MantineUI>>
            +rows: DashboardReservation[]
            +selectedIndex: number
        }
        class RequirementBadge {
            <<React Component>>
            +flag: RequirementFlag
        }
        class KeyboardShortcuts {
            <<Hook · Mantine useHotkeys>>
            +bind(shortcut: string, action: Function) void
        }
    }

    CheckInRequirementsPolicy ..> CheckInSnapshot
    CheckInRequirementsPolicy ..> RequirementFlag
    GetFrontDeskDashboardUseCase --> FrontDeskDashboardReadModel
    GetFrontDeskDashboardUseCase --> CheckInRequirementsPolicy
    GetFrontDeskDashboardUseCase ..> FrontDeskDashboard
    FrontDeskDashboard *-- DashboardReservation
    PostgresFrontDeskDashboardReadModel ..|> FrontDeskDashboardReadModel
    FrontDeskDashboardView --> RequiresPermission : FRONT_DESK_ACCESS
    FrontDeskDashboardView --> GetFrontDeskDashboardUseCase

    FrontDeskDashboardPage --> RequirementBadge
    FrontDeskDashboardPage --> KeyboardShortcuts
    FrontDeskDashboardPage ..> FrontDeskDashboardView : GET /api/v1/properties/{id}/front-desk/dashboard
```

### Design notes
- **CQRS-style read side:** the dashboard is a query, not a domain operation. `FrontDeskDashboardReadModel` reads everything in **one** SQL query (or database view) joining reservation, guest, room, ID verification and deposit hold, so the screen is fast (business document: "extreme efficiency").
- **Flags are computed in the domain** (`CheckInRequirementsPolicy`), not in SQL or React, so the same rule can also block the check-in itself (US-13):
  - `MISSING_ID_VERIFICATION`: no successful ID verification (US-12) and no management override;
  - `MISSING_DEPOSIT`: no authorized deposit hold (US-13).
- **Which reservations appear (PENDING):** the full dashboard content (arrivals, in-house, departures) and any extra flags are undefined. Flags apply to reservations that are not yet In-House, because both requirements belong to check-in.
- **Keyboard-friendly (Scenario 3):**
  - **Navigate:** `↑`/`↓` move the selected row;
  - **Act:** `Enter` opens it, `C` starts check-in, `/` focuses the search, `R` refreshes;
  - this shortcut set is a UI proposal to confirm, implemented with MantineUI's `useHotkeys`.
- **Response-time targets** are PENDING.
- **Permission:** a `FRONT_DESK_ACCESS` permission is added to the role-permission matrix (US-01).

---

## 2. ER Diagram (sources of the read model)

```mermaid
erDiagram
    RESERVATION ||--|| GUEST_PROFILE : "belongs to"
    RESERVATION }o--|| ROOM_TYPE : "is booked as"
    RESERVATION }o--o| ROOM : "is assigned"
    RESERVATION ||--o| ID_VERIFICATION : "has"
    RESERVATION ||--o{ DEPOSIT_HOLD : "has"

    RESERVATION {
        uuid id PK "US-06"
        uuid property_id FK "filter"
        varchar status "US-11"
        date check_in_date "filter"
        date check_out_date
    }
    GUEST_PROFILE {
        uuid id PK "US-20"
        varchar full_name
    }
    ROOM_TYPE {
        uuid id PK "US-02"
        varchar name
    }
    ROOM {
        uuid id PK "US-02"
        varchar number
    }
    ID_VERIFICATION {
        uuid id PK "US-12"
        uuid reservation_id FK
        varchar result "ELIGIBLE, UNDERAGE"
        boolean overridden
    }
    DEPOSIT_HOLD {
        uuid id PK "US-13"
        uuid reservation_id FK
        varchar status "AUTHORIZED, DECLINED, ..."
    }
```

### Design notes
- **No new table.** The dashboard reads the tables owned by US-02, US-06, US-12, US-13 and US-20.
- **Index:** `RESERVATION (property_id, check_in_date, status)` supports the main filter.
- **Database view:** the query can live in a view such as `front_desk_dashboard_v` so the read model stays a single, testable SQL statement.

---

## 3. Event Flow

### 3.1 Opening the dashboard — Scenarios 1 and 2

```mermaid
sequenceDiagram
    autonumber
    actor Agent as Front Desk Agent
    participant Page as FrontDeskDashboardPage
    participant View as FrontDeskDashboardView<br/>GET /api/v1/properties/{id}/front-desk/dashboard
    participant UC as GetFrontDeskDashboardUseCase
    participant RM as FrontDeskDashboardReadModel
    participant Policy as CheckInRequirementsPolicy

    Agent->>Page: Open dashboard
    Page->>View: GET (property, business date)
    View->>UC: execute(property_id, business_date)
    UC->>RM: reservations_to_handle(property_id, business_date)
    RM-->>UC: rows (reservation, guest, room, ID result, hold status)
    loop each reservation
        UC->>Policy: missing_requirements(snapshot)
        Policy-->>UC: flags, e.g., MISSING_DEPOSIT
    end
    UC-->>View: FrontDeskDashboard
    View-->>Page: 200 OK
    Page-->>Agent: Reservations with state, missing requirements highlighted with RequirementBadge
```

### 3.2 Keyboard navigation — Scenario 3

```mermaid
stateDiagram-v2
    [*] --> ListFocused: page loads
    ListFocused --> ListFocused: Up / Down moves selection
    ListFocused --> SearchFocused: "/"
    SearchFocused --> ListFocused: Esc or Enter
    ListFocused --> ReservationOpen: Enter
    ReservationOpen --> CheckInFlow: C (US-12, US-13)
    ReservationOpen --> ListFocused: Esc
    CheckInFlow --> ListFocused: completed or Esc
    ListFocused --> ListFocused: R refreshes data
```

### 3.3 Domain events

No domain event is emitted; this story is read-only. Data freshness comes from reloading (`R` or periodic refresh). Pushing live updates to the dashboard is PENDING.
