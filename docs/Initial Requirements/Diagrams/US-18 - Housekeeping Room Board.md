# US-18 — Housekeeping Room Board: Diagrams

> Source: `US-18-housekeeping-room-board.md`. Related: US-01 (permissions, Head Housekeeper), US-02 (room note), US-10 (dashboard receives the same pushes), US-19 (states and actions).

## Business rules reflected

| Rule (US-18) | Where it appears |
|---|---|
| Works on mobile and tablet | `HousekeepingBoard` responsive React/MantineUI page |
| Real-time with WebSockets (Django Channels), RabbitMQ as message layer | `RoomBoardConsumer`, `ChannelsRealtimePublisher` |
| State → group mapping (Clean, Stayover, Stayover + badge, Checkout/Dirty, Out of service) | `BoardGroupMapper` |
| Everyone sees Out of service; only Head Housekeeper or GM act on it | `AllowedActionsPolicy` |
| Card: number, type, state, badge, note, allowed actions | `RoomCard` DTO |
| No financial data, no guest names | `RoomCard` has no guest or money fields |
| Own property (GM chooses); sorted by room number within each group | `PropertyScope`, ordering |
| State changes also pushed to the front desk dashboard | Same group `property.{id}.rooms` consumed by US-10 |

---

## 1. Class Diagram (Clean Architecture)

```mermaid
classDiagram
    direction LR

    namespace Domain {
        class BoardGroup {
            <<Enumeration>>
            CHECKOUT_DIRTY
            STAYOVER
            CLEAN
            OUT_OF_SERVICE
        }
        class BoardGroupMapper {
            <<Domain Service>>
            +group(room_state, guest_in_house) BoardGroup
            +cleaning_requested(room_state, guest_in_house) bool
        }
        class AllowedActionsPolicy {
            <<Domain Service · US-19>>
            +actions(room, guest_in_house, user) list~RoomAction~
        }
        class RoomAction {
            <<Enumeration · US-19>>
            REQUEST_STAYOVER_CLEANING
            MARK_CLEANED
            START_CLEANING
            VERIFY
            TAKE_OUT_OF_SERVICE
            RETURN_TO_SERVICE
        }
    }

    namespace Application {
        class GetRoomBoardUseCase {
            <<Query>>
            +execute(user, property_id) RoomBoard
        }
        class RoomBoard {
            <<DTO>>
            +dict groups
        }
        class RoomCard {
            <<DTO · no guest, no money>>
            +RoomId id
            +str number
            +str room_type
            +RoomState state
            +bool cleaning_requested
            +str note
            +list~RoomAction~ allowed_actions
        }
        class RoomBoardReadModel {
            <<Port>>
            +rooms(property_id) list~RoomFacts~
        }
        class RoomStateChangedHandler {
            <<after commit>>
            +handle(event) None
        }
        class RealtimePublisher {
            <<Port>>
            +publish(group, payload) None
        }
    }

    namespace Infrastructure {
        class ChannelsRealtimePublisher {
            <<Django Channels · RabbitMQ channel layer>>
        }
        class PostgresRoomBoardReadModel
    }

    namespace Interface {
        class RoomBoardView {
            <<REST · HOUSEKEEPING_BOARD>>
            GET /api/v1/properties/id/room-board
        }
        class RoomBoardConsumer {
            <<WebSocket>>
            ws /ws/properties/id/rooms
        }
    }

    namespace FrontEnd {
        class HousekeepingBoard {
            <<React · MantineUI · mobile and tablet>>
        }
    }

    BoardGroupMapper ..> BoardGroup
    AllowedActionsPolicy ..> RoomAction
    GetRoomBoardUseCase --> RoomBoardReadModel
    GetRoomBoardUseCase --> BoardGroupMapper
    GetRoomBoardUseCase --> AllowedActionsPolicy
    GetRoomBoardUseCase ..> RoomBoard
    RoomBoard *-- RoomCard
    RoomStateChangedHandler --> BoardGroupMapper
    RoomStateChangedHandler --> RealtimePublisher
    ChannelsRealtimePublisher ..|> RealtimePublisher
    PostgresRoomBoardReadModel ..|> RoomBoardReadModel
    RoomBoardView --> GetRoomBoardUseCase
    HousekeepingBoard ..> RoomBoardView : initial load
    HousekeepingBoard ..> RoomBoardConsumer : live updates
```

### Design notes
- **Mapping (`BoardGroupMapper`):** `AVAILABLE` → Clean; `OCCUPIED` → Stayover; `DIRTY` with the guest In-House → Stayover + "cleaning requested"; `DIRTY` after check-out → Checkout/Dirty; `CLEANING` → Checkout/Dirty; `UNAVAILABLE`, `MAINTENANCE` → Out of service.
- **"Guest In-House"** comes from the reservation assigned to the room with status `IN_HOUSE`. The board uses it only as a boolean; no name is sent.
- **Allowed actions** are computed on the server per user (US-19 rules); actions on Out of service rooms appear only for a Head Housekeeper or the GM. The buttons call the US-19 endpoints.
- **Push payload** per change: room id, number, type, state, group, badge, note. Each client recomputes its own allowed actions on receipt by refetching the card, so permissions stay server-side.
- **Consumers:** the WebSocket connection is authenticated with the staff session and joins `property.{id}.rooms` only if the property is in the user's scope.

---

## 2. ER Diagram (sources of the read model)

```mermaid
erDiagram
    PROPERTY ||--o{ ROOM : "has"
    ROOM_TYPE ||--o{ ROOM : "templates"
    ROOM ||--o{ RESERVATION : "assigned to"

    ROOM {
        uuid id PK "US-02"
        uuid property_id FK
        uuid room_type_id FK
        varchar number "sort key"
        varchar note
        varchar state "US-19"
        boolean is_active
    }
    ROOM_TYPE {
        uuid id PK "US-02"
        varchar name_en
        varchar name_fr
    }
    RESERVATION {
        uuid id PK "US-06"
        uuid room_id FK
        varchar status "IN_HOUSE means guest in room"
    }
    PROPERTY {
        uuid id PK "US-02"
    }
```

---

## 3. Event Flow

### 3.1 Live update — Scenarios 2 and 4

```mermaid
sequenceDiagram
    autonumber
    actor HK as Housekeeper
    participant Board as HousekeepingBoard (other devices)
    participant Desk as Front desk dashboard
    participant API as Room action endpoint (US-19)
    participant Handler as RoomStateChangedHandler
    participant Pub as RealtimePublisher
    participant Layer as RabbitMQ channel layer

    HK->>API: action (e.g., request stayover cleaning)
    API->>API: state change committed (US-19)
    API-->>Handler: RoomStateChanged (after commit)
    Handler->>Pub: publish(property.{id}.rooms, room card data)
    Pub->>Layer: group_send
    Layer-->>Board: room moves group or shows the badge
    Layer-->>Desk: room state updated live
```

### 3.2 Group mapping

```mermaid
flowchart LR
    AV[Available] --> CLEAN[Clean]
    OC[Occupied] --> STAY[Stayover]
    DI1["Dirty, guest In-House"] --> STAYB["Stayover + cleaning requested"]
    DI2["Dirty, after check-out"] --> CD[Checkout/Dirty]
    CL[Cleaning] --> CD
    UN[Unavailable] --> OOS[Out of service]
    MA[Maintenance] --> OOS
```

### 3.3 Domain events

Consumes `RoomStateChanged` (US-19). Emits none.
