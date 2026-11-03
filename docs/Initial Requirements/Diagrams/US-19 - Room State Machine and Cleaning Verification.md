# US-19 — Room State Machine and Cleaning Verification: Diagrams

> Source: `US-19-room-state-machine-and-cleaning-verification.md`. Related: US-01 (Head Housekeeper privilege), US-13 (check-in), US-17 (check-out), US-18 (board), US-23 (room history for available room-nights).

## Business rules reflected

| Rule (US-19) | Where it appears |
|---|---|
| States: Available, Occupied, Dirty, Cleaning, Unavailable, Maintenance | `RoomState` |
| Allowed transitions table; any other blocked | `RoomStateMachine.TRANSITIONS`, state diagram 3.1 |
| Only Head Housekeeper verification moves Cleaning → Available; may verify own cleaning | `VerifyCleaningUseCase` guard; no "different person" check |
| Check-in only into an Available room | `Room.occupy()` guard |
| Maintenance for repairs, Unavailable for other reasons | Two states, reason text |
| Only Head Housekeeper or GM move to Unavailable/Maintenance, reason required | `TakeOutOfServiceUseCase` |
| Not while a guest is In-House | `GuestInHouse` guard |
| Return from Unavailable/Maintenance goes to Dirty | `ReturnToServiceUseCase` |
| Stayover cleaning: HK, GM or FDA move to Dirty; HK marks CLEANED → Occupied | `RequestStayoverCleaningUseCase`, `MarkCleanedUseCase` |
| Every change recorded with who and when | `ROOM_STATE_HISTORY` |

---

## 1. Class Diagram (Clean Architecture)

```mermaid
classDiagram
    direction LR

    namespace Domain {
        class RoomState {
            <<Enumeration>>
            AVAILABLE
            OCCUPIED
            DIRTY
            CLEANING
            UNAVAILABLE
            MAINTENANCE
        }
        class Room {
            <<Aggregate Root>>
            +RoomId id
            +RoomState state
            +int version
            +occupy() None
            +vacate() None
            +request_stayover_cleaning(actor) None
            +mark_cleaned(actor) None
            +start_cleaning(actor) None
            +verify(actor) None
            +take_out_of_service(state, reason, actor) None
            +return_to_service(actor) None
        }
        class RoomStateMachine {
            <<Domain Service>>
            +TRANSITIONS
            +assert_allowed(from, to, guest_in_house, actor) None
        }
        class RoomStateChange {
            <<Value Object>>
            +RoomState from_state
            +RoomState to_state
            +str reason
            +Actor actor
            +datetime changed_at
        }
        class RoomRepository {
            <<Port>>
        }
        class OccupancyReader {
            <<Port>>
            +guest_in_house(room_id) bool
        }
    }

    namespace Application {
        class RequestStayoverCleaningUseCase {
            <<HK, GM or FDA>>
        }
        class MarkCleanedUseCase {
            <<Housekeeper>>
        }
        class StartCleaningUseCase {
            <<Any Housekeeper>>
        }
        class VerifyCleaningUseCase {
            <<Head Housekeeper>>
        }
        class TakeOutOfServiceUseCase {
            <<Head Housekeeper or GM>>
        }
        class ReturnToServiceUseCase {
            <<Head Housekeeper or GM>>
        }
        class EventBus {
            <<Port · after commit>>
        }
    }

    namespace Infrastructure {
        class DjangoRoomRepository {
            <<optimistic lock on version>>
        }
    }

    namespace Interface {
        class RoomActionViews {
            <<REST>>
            POST /api/v1/rooms/id/stayover-cleaning
            POST /api/v1/rooms/id/cleaned
            POST /api/v1/rooms/id/cleaning
            POST /api/v1/rooms/id/verification
            POST /api/v1/rooms/id/out-of-service
            POST /api/v1/rooms/id/return-to-service
        }
    }

    Room --> RoomState
    Room ..> RoomStateChange
    Room --> RoomStateMachine
    RequestStayoverCleaningUseCase --> RoomRepository
    RequestStayoverCleaningUseCase --> OccupancyReader
    MarkCleanedUseCase --> OccupancyReader
    StartCleaningUseCase --> OccupancyReader
    TakeOutOfServiceUseCase --> OccupancyReader
    VerifyCleaningUseCase --> RoomRepository
    ReturnToServiceUseCase --> RoomRepository
    VerifyCleaningUseCase --> EventBus
    DjangoRoomRepository ..|> RoomRepository
    RoomActionViews --> RequestStayoverCleaningUseCase
    RoomActionViews --> MarkCleanedUseCase
    RoomActionViews --> StartCleaningUseCase
    RoomActionViews --> VerifyCleaningUseCase
    RoomActionViews --> TakeOutOfServiceUseCase
    RoomActionViews --> ReturnToServiceUseCase
```

### Design notes
- **The two Dirty cases** are told apart by whether a reservation with status `IN_HOUSE` is assigned to the room (`OccupancyReader`): with a guest, `DIRTY → OCCUPIED` (mark CLEANED); after check-out, `DIRTY → CLEANING` (start cleaning).
- **Out of service** is allowed from `AVAILABLE`, `DIRTY` (after check-out) or `CLEANING`, never from `OCCUPIED` or a Dirty room with a guest In-House (Scenario 6). The reason is required and saved in the history.
- **Check-in and check-out transitions** (`occupy()`, `vacate()`) are called by US-13 and US-17 inside their own transactions.
- **Every change** appends a `ROOM_STATE_HISTORY` row and raises `RoomStateChanged` after commit, which US-18 pushes to the board and dashboard. US-23 reads this history to know which rooms were out of service at the 2:00 AM Night Audit.
- **Concurrency:** `ROOM.version` prevents two users from applying conflicting actions at the same time.

---

## 2. ER Diagram

```mermaid
erDiagram
    ROOM ||--o{ ROOM_STATE_HISTORY : "records"
    STAFF_USER ||--o{ ROOM_STATE_HISTORY : "changes"

    ROOM {
        uuid id PK "US-02"
        varchar state "AVAILABLE, OCCUPIED, DIRTY, CLEANING, UNAVAILABLE, MAINTENANCE"
        int version
    }
    ROOM_STATE_HISTORY {
        uuid id PK
        uuid room_id FK
        varchar from_state
        varchar to_state
        text reason "required for UNAVAILABLE and MAINTENANCE"
        varchar actor_type "STAFF or SYSTEM"
        uuid actor_id FK
        varchar trigger "CHECK_IN, CHECK_OUT, STAYOVER_REQUEST, CLEANED, START_CLEANING, VERIFY, OUT_OF_SERVICE, RETURN_TO_SERVICE"
        timestamptz changed_at "index with room_id"
    }
    STAFF_USER {
        uuid id PK "US-01"
    }
```

---

## 3. Event Flow

### 3.1 Room state machine

```mermaid
stateDiagram-v2
    [*] --> Available : room registered (US-02)
    Available --> Occupied : check-in
    Occupied --> DirtyInHouse : stayover request (HK, GM or FDA)
    DirtyInHouse --> Occupied : HK marks CLEANED
    Occupied --> DirtyAfterCheckout : check-out
    DirtyAfterCheckout --> Cleaning : any HK starts cleaning
    Cleaning --> Available : Head Housekeeper verifies
    state "Out of service" as OOS {
        Unavailable
        Maintenance
    }
    Available --> OOS : Head HK or GM, reason
    DirtyAfterCheckout --> OOS : Head HK or GM, reason
    Cleaning --> OOS : Head HK or GM, reason
    OOS --> DirtyAfterCheckout : Head HK or GM returns to service
```

> `DirtyInHouse` and `DirtyAfterCheckout` are the same stored state (`DIRTY`), shown separately to make the guest-in-house rule visible.

### 3.2 Taking a room out of service — Scenarios 5 and 6

```mermaid
sequenceDiagram
    autonumber
    actor HH as Head Housekeeper or GM
    participant View as RoomActionViews
    participant UC as TakeOutOfServiceUseCase
    participant Occ as OccupancyReader
    participant Room

    HH->>View: POST out-of-service (MAINTENANCE, reason)
    View->>UC: execute(room_id, state, reason, actor)
    UC->>Occ: guest_in_house(room)
    alt guest In-House
        UC-->>HH: 409 blocked
    else no guest
        UC->>Room: take_out_of_service(MAINTENANCE, reason, actor)
        alt state not allowed or reason empty
            Room-->>HH: 422 blocked
        else allowed
            Room->>Room: history row (who, when, reason)
            UC-->>HH: 200 room in Maintenance, no check-ins
        end
    end
```

### 3.3 Domain events

| Event | Raised when | Consumers |
|---|---|---|
| `RoomStateChanged` | Any transition | Housekeeping board and dashboard (US-18, US-10), occupancy report (US-23) |
