# US-18 — Housekeeping Room Board: Diagrams

> Sources: `US-18-housekeeping-room-board.md`, `US-19-room-state-machine-and-cleaning-verification.md`, `US-01-staff-authentication-and-role-based-access.md`, `docs/Business Modeling/Business Modeling.md` (Personas), `docs/Tech Stack/Tools.md`, `CLAUDE.md`.
> Elements tagged **PENDING** depend on business rules not defined yet. They are placeholders in the design, not decisions.
> Data is scoped per **Property** (Business Modeling, Section 5) even where the story text does not mention it.

---

## 1. Class Diagram (Clean Architecture + Front-end)

```mermaid
classDiagram
    direction LR

    namespace Domain {
        class HousekeepingGroup {
            <<Enumeration>>
            CHECKOUT_DIRTY
            STAYOVER
            CLEAN
        }
        class HousekeepingGroupMapper {
            <<Domain Service · mapping PENDING>>
            +group_for(room_state: RoomState, has_in_house_reservation: bool) HousekeepingGroup
        }
        class RoomState {
            <<Enumeration · US-19>>
            AVAILABLE
            OCCUPIED
            DIRTY
            CLEANING
        }
        class RoomStateChanged {
            <<Domain Event · US-19>>
            +RoomId room_id
            +PropertyId property_id
            +RoomState from_state
            +RoomState to_state
            +datetime occurred_at_utc
        }
    }

    namespace Application {
        class GetRoomBoardUseCase {
            <<Query Use Case>>
            +execute(property_id: PropertyId) RoomBoard
        }
        class ChangeRoomStateUseCase {
            <<Use Case · US-19>>
            +execute(command: ChangeRoomStateCommand) None
        }
        class BroadcastRoomStateOnChange {
            <<Event Handler · after commit>>
            +handle(event: RoomStateChanged) None
        }
        class RoomBoard {
            <<DTO · no financial fields>>
            +dict~HousekeepingGroup, list~RoomBoardItem~~ groups
        }
        class RoomBoardItem {
            <<DTO · no financial fields>>
            +UUID room_id
            +str number
            +str room_type
            +str state
        }
        class RoomBoardReadModel {
            <<Port · read side>>
            +rooms_with_occupancy(property_id: PropertyId) list~RoomOccupancyRow~
        }
        class RealtimeNotifier {
            <<Port · technology PENDING>>
            +publish(channel: str, message: dict) None
        }
    }

    namespace Infrastructure {
        class PostgresRoomBoardReadModel {
            <<Adapter>>
        }
        class RealtimeNotifierAdapter {
            <<Adapter · WebSocket or SSE, PENDING>>
        }
    }

    namespace Interface {
        class RoomBoardView {
            <<REST Controller>>
            +get(request, property_id) Response
        }
        class RoomStateView {
            <<REST Controller · US-19>>
            +post(request, room_id) Response
        }
        class RoomBoardStream {
            <<Real-time endpoint · PENDING>>
            +subscribe(property_id) Stream
        }
    }

    namespace FrontEnd {
        class RoomBoardPage {
            <<React Component · MantineUI, mobile-first>>
            +groups: RoomBoard
            +onStateChange(roomId, action) void
        }
        class FrontDeskDashboardPage {
            <<React Component · US-10>>
        }
    }

    HousekeepingGroupMapper ..> RoomState
    HousekeepingGroupMapper ..> HousekeepingGroup
    GetRoomBoardUseCase --> RoomBoardReadModel
    GetRoomBoardUseCase --> HousekeepingGroupMapper
    GetRoomBoardUseCase ..> RoomBoard
    RoomBoard *-- RoomBoardItem
    BroadcastRoomStateOnChange ..> RoomStateChanged : handles
    BroadcastRoomStateOnChange --> RealtimeNotifier
    BroadcastRoomStateOnChange --> HousekeepingGroupMapper

    PostgresRoomBoardReadModel ..|> RoomBoardReadModel
    RealtimeNotifierAdapter ..|> RealtimeNotifier
    RoomBoardView --> GetRoomBoardUseCase
    RoomStateView --> ChangeRoomStateUseCase
    RoomBoardStream ..> RealtimeNotifierAdapter

    RoomBoardPage ..> RoomBoardView : GET /api/v1/properties/{id}/room-board
    RoomBoardPage ..> RoomStateView : POST /api/v1/rooms/{id}/state-transitions
    RoomBoardPage ..> RoomBoardStream : subscribe
    FrontDeskDashboardPage ..> RoomBoardStream : subscribe
```

### Design notes
- **No financial data by construction (Scenario 3):**
  - `RoomBoard` and `RoomBoardItem` have no rate, balance or guest-payment fields, and the read model does not select them;
  - the endpoint needs only a housekeeping permission, never `FINANCIAL_DATA_ACCESS`;
  - financial endpoints still deny Housekeepers (US-01).
- **Grouping:** `HousekeepingGroupMapper` turns a room's state (plus whether it has an In-House reservation) into the board groups `Checkout/Dirty`, `Stayover` and `Clean`. The exact mapping is PENDING (US-18 business rules), and it lives only in this class, so the decision changes one place.
- **Real-time (Scenario 2):**
  - state changes go through the US-19 state machine;
  - after commit, `BroadcastRoomStateOnChange` pushes the change to every subscriber of the property's channel (housekeeping devices and the front desk).
- **Real-time technology is PENDING.** WebSockets (e.g., Django Channels) or Server-Sent Events are candidates, and neither is in `Tools.md`. `RealtimeNotifier` keeps the choice behind a port.
- **Mobile/tablet:** `RoomBoardPage` is mobile-first with large touch targets (MantineUI responsive grid). Each group is a section; each room is a card with the actions its state allows.

---

## 2. ER Diagram (sources of the read model)

```mermaid
erDiagram
    PROPERTY ||--o{ ROOM : "owns"
    ROOM_TYPE ||--o{ ROOM : "classifies"
    ROOM ||--o{ RESERVATION : "hosts"
    ROOM ||--o{ ROOM_STATE_HISTORY : "changes through"

    ROOM {
        uuid id PK "US-02"
        uuid property_id FK "filter"
        varchar number
        varchar state "AVAILABLE, OCCUPIED, DIRTY, CLEANING (US-19)"
        int version
    }
    ROOM_TYPE {
        uuid id PK "US-02"
        varchar name
    }
    RESERVATION {
        uuid id PK "US-06"
        uuid room_id FK
        varchar status "IN_HOUSE identifies a stayover candidate"
    }
    ROOM_STATE_HISTORY {
        uuid id PK "US-19"
        uuid room_id FK
        varchar to_state
        timestamptz changed_at "UTC"
    }
    PROPERTY {
        uuid id PK "partial"
    }
```

### Design notes
- **No new table.** The board reads `ROOM`, `ROOM_TYPE` and the In-House `RESERVATION` of each room. Financial tables (`FOLIO`, `DEPOSIT_HOLD`, rates) are never joined.
- **Index:** `ROOM (property_id, state)` keeps the board query fast on mobile connections.

---

## 3. Event Flow

### 3.1 Opening the board — Scenario 1

```mermaid
sequenceDiagram
    autonumber
    actor HK as Housekeeper (mobile/tablet)
    participant Page as RoomBoardPage
    participant View as RoomBoardView<br/>GET /api/v1/properties/{id}/room-board
    participant UC as GetRoomBoardUseCase
    participant RM as RoomBoardReadModel
    participant Map as HousekeepingGroupMapper

    HK->>Page: Open room board
    Page->>View: GET (housekeeping permission)
    View->>UC: execute(property_id)
    UC->>RM: rooms_with_occupancy(property_id)
    RM-->>UC: rows (room, type, state, in-house flag)
    loop each room
        UC->>Map: group_for(state, has_in_house_reservation)
        Map-->>UC: CHECKOUT_DIRTY / STAYOVER / CLEAN (mapping PENDING)
    end
    UC-->>View: RoomBoard (no financial fields)
    View-->>Page: 200 OK
    Page->>Page: subscribe to the property's real-time channel
    Page-->>HK: Rooms grouped by Checkout/Dirty, Stayover, Clean
```

### 3.2 Instant update for all users — Scenario 2

```mermaid
sequenceDiagram
    autonumber
    actor HK as Housekeeper
    participant Page as RoomBoardPage
    participant View as RoomStateView (US-19)
    participant UC as ChangeRoomStateUseCase (US-19)
    participant Bus as EventPublisher
    participant H as BroadcastRoomStateOnChange
    participant RT as RealtimeNotifier
    participant Other as Other housekeeping devices
    participant FD as Front Desk (US-10)

    HK->>Page: Tap "Start cleaning" on Room 101
    Page->>View: POST state transition
    View->>UC: execute(room 101, START_CLEANING)
    UC->>UC: Room state machine (US-19), commit
    UC->>Bus: publish(RoomStateChanged DIRTY to CLEANING)
    View-->>Page: 200 OK
    Bus->>H: after commit: handle(event)
    H->>RT: publish("property:{id}:rooms", room 101 CLEANING)
    par Fan-out
        RT-->>Other: room 101 moves group
    and
        RT-->>FD: room 101 status updated
    end
```

### 3.3 Domain events

| Event | Emitted by | When | Payload | Consumers |
|---|---|---|---|---|
| `RoomStateChanged` | `Room` (US-19) | Any room state transition (check-in, check-out, cleaning, verification) | `room_id`, `property_id`, `from_state`, `to_state`, `occurred_at_utc` | `BroadcastRoomStateOnChange` (after commit) |
