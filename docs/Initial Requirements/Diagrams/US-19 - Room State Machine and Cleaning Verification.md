# US-19 — Room State Machine and Cleaning Verification: Diagrams

> Sources: `US-19-room-state-machine-and-cleaning-verification.md` (Business Rules updated on 2026-11-02), `US-01-staff-authentication-and-role-based-access.md`, `US-13-deposit-pre-authorization-hold.md`, `US-17-check-out-with-zero-balance.md`, `docs/Business Modeling/Business Modeling.md` (Section 2 "The Room State Machine"), `CLAUDE.md`.
> Elements tagged **PENDING** depend on business rules not defined yet. They are placeholders in the design, not decisions.
> Data is scoped per **Property** (Business Modeling, Section 5) even where the story text does not mention it.
>
> **Head Housekeeper:** per US-01, Head Housekeeper is a *privilege* the General Manager grants to any Housekeeper, not a separate role. It is modelled as individual permission grants.

### Business rules reflected in this design

| Rule | Where it is modelled |
|---|---|
| Available → Occupied (check-in) → Dirty (check-out) → Cleaning → Available | `RoomStateMachine` transition table |
| Only the Head Housekeeper's verification moves a room from Cleaning to Available | `VERIFY_CLEAN` requires `ROOM_CLEANING_VERIFICATION` |
| A guest can only be checked into an Available room | `Room.occupy()` guard |
| Only a Head Housekeeper or a General Manager can move a room from any state to Unavailable or Maintenance | `SET_UNAVAILABLE` / `SET_MAINTENANCE` require `ROOM_OUT_OF_SERVICE` |
| Stayover cleaning: on the guest's request, a Housekeeper or General Manager moves the room to Dirty; after cleaning, the Housekeeper marks it cleaned and it returns to Occupied | `REQUEST_STAYOVER_CLEANING` (Occupied → Dirty) and `MARK_STAYOVER_CLEANED` (Dirty → Occupied), allowed only while the room has an In-House guest |

---

## 1. Room State Machine

```mermaid
stateDiagram-v2
    [*] --> Available: initial state on registration PENDING (US-02)

    state "In service" as InService {
        Available --> Occupied: check-in (US-13)
        Occupied --> Dirty: check-out (US-17), or stayover cleaning requested
        Dirty --> Cleaning: start cleaning (vacant room)
        Cleaning --> Available: verify cleaning (Head Housekeeper)
        Dirty --> Occupied: mark CLEANED (stayover, guest still In-House)
    }

    state "Out of service" as OutOfService {
        Unavailable
        Maintenance
    }

    InService --> OutOfService: set Unavailable or Maintenance

    note right of OutOfService
        Only a Head Housekeeper or the
        General Manager, from any state.
        Leaving these states (to which
        state, and by whom) is PENDING.
    end note
```

### Transition table

| From | To | Action | Who | Guard |
|---|---|---|---|---|
| Available | Occupied | `CHECK_IN` | Front Desk Agent, via US-13 | Room assigned to the reservation |
| Occupied | Dirty | `CHECK_OUT` | Front Desk Agent, via US-17 | Clears the In-House guest |
| Occupied | Dirty | `REQUEST_STAYOVER_CLEANING` | Housekeeper or General Manager | Room has an In-House guest |
| Dirty | Occupied | `MARK_STAYOVER_CLEANED` | Housekeeper | Room still has an In-House guest |
| Dirty | Cleaning | `START_CLEANING` | Housekeeper | Room has **no** In-House guest (after check-out) |
| Cleaning | Available | `VERIFY_CLEAN` | Head Housekeeper (privilege) | — |
| Any state | Unavailable | `SET_UNAVAILABLE` | Head Housekeeper or General Manager | — |
| Any state | Maintenance | `SET_MAINTENANCE` | Head Housekeeper or General Manager | — |

`Dirty` has two meanings depending on whether a guest is still In-House. The guard decides which exit is allowed: a stayover room goes back to `Occupied`, while a vacated room goes through `Cleaning` and verification to `Available`.

---

## 2. Class Diagram (Clean Architecture)

```mermaid
classDiagram
    direction LR

    namespace Domain {
        class Room {
            <<Entity / Aggregate Root · US-02>>
            -RoomId id
            -PropertyId property_id
            -RoomState state
            -ReservationId | None in_house_reservation_id
            -int version
            +occupy(reservation_id) None
            +vacate() None
            +request_stayover_cleaning(by: StaffMemberId) None
            +mark_stayover_cleaned(by: StaffMemberId) None
            +start_cleaning(by: StaffMemberId) None
            +verify_clean(by: StaffMemberId) None
            +take_out_of_service(target: RoomState, by: StaffMemberId) None
            +has_in_house_guest() bool
            -transition_to(target: RoomState, action: RoomTransition, by: Actor) None
        }
        class RoomState {
            <<Enumeration>>
            AVAILABLE
            OCCUPIED
            DIRTY
            CLEANING
            UNAVAILABLE
            MAINTENANCE
        }
        class RoomTransition {
            <<Enumeration>>
            CHECK_IN
            CHECK_OUT
            REQUEST_STAYOVER_CLEANING
            MARK_STAYOVER_CLEANED
            START_CLEANING
            VERIFY_CLEAN
            SET_UNAVAILABLE
            SET_MAINTENANCE
        }
        class RoomStateMachine {
            <<Domain Service / Transition Table>>
            +ensure_allowed(current: RoomState, action: RoomTransition, has_in_house_guest: bool) RoomState
            +required_permission(action: RoomTransition) Permission | None
        }
        class RoomStateChanged {
            <<Domain Event>>
            +RoomId room_id
            +PropertyId property_id
            +RoomState from_state
            +RoomState to_state
            +RoomTransition action
            +Actor actor
            +datetime occurred_at_utc
        }
        class InvalidRoomTransitionError {
            <<Domain Exception>>
        }
        class RoomNotAvailableError {
            <<Domain Exception>>
        }
    }

    namespace Application {
        class ChangeRoomStateUseCase {
            <<Use Case>>
            +execute(command: ChangeRoomStateCommand) None
        }
        class ChangeRoomStateCommand {
            <<DTO>>
            +UUID room_id
            +str action "REQUEST_STAYOVER_CLEANING, MARK_STAYOVER_CLEANED, START_CLEANING, VERIFY_CLEAN, SET_UNAVAILABLE, SET_MAINTENANCE"
            +UUID staff_member_id
        }
        class StaffPermissionQuery {
            <<Port · US-01>>
            +has_permission(staff_member_id, permission: Permission) bool
        }
        class RoomRepository {
            <<Port · US-02>>
            +get_by_id(room_id: RoomId) Room
            +save(room: Room) None
        }
        class RoomStateHistoryRepository {
            <<Port>>
            +append(event: RoomStateChanged) None
        }
        class UnitOfWork {
            <<Port>>
            +commit() None
        }
        class EventPublisher {
            <<Port>>
            +publish(event: DomainEvent) None
        }
    }

    namespace Interface {
        class RoomStateView {
            <<REST Controller>>
            +post(request, room_id) Response
        }
        class PermissionDeniedError {
            <<Application Exception · US-01>>
        }
    }

    Room --> RoomState
    Room --> RoomStateMachine : delegates rule
    RoomStateMachine ..> RoomTransition
    RoomStateMachine ..> InvalidRoomTransitionError : raises
    Room ..> RoomNotAvailableError : raises on occupy
    Room ..> RoomStateChanged : records

    ChangeRoomStateUseCase ..> ChangeRoomStateCommand
    ChangeRoomStateUseCase --> RoomRepository
    ChangeRoomStateUseCase --> RoomStateMachine : required_permission(action)
    ChangeRoomStateUseCase --> StaffPermissionQuery
    ChangeRoomStateUseCase --> RoomStateHistoryRepository
    ChangeRoomStateUseCase --> UnitOfWork
    ChangeRoomStateUseCase --> EventPublisher
    ChangeRoomStateUseCase ..> PermissionDeniedError : raises
    RoomStateView --> ChangeRoomStateUseCase
```

### Design notes
- **One transition table, one entry point:**
  - `RoomStateMachine` holds the table above, including the guard on whether the room has an In-House guest;
  - `Room.transition_to` is the only way to change a state, so anything outside the table raises `InvalidRoomTransitionError` (`409 Conflict`).
- **`in_house_reservation_id` tells the two kinds of Dirty apart:**
  - it is set by check-in (`occupy`, US-13) and cleared by check-out (`vacate`, US-17);
  - with a guest present, `Dirty` can only go back to `Occupied` (`MARK_STAYOVER_CLEANED`), and `START_CLEANING` / `VERIFY_CLEAN` are refused;
  - without a guest, the room must go `Cleaning` → `Available` through verification.
- **Permissions per action:** `required_permission(action)` returns the permission each action needs, and the use case checks it for the staff member before the domain runs.

  | Action | Permission | Granted to |
  |---|---|---|
  | `REQUEST_STAYOVER_CLEANING` | `STAYOVER_CLEANING` | Housekeeper role, General Manager role |
  | `MARK_STAYOVER_CLEANED`, `START_CLEANING` | `HOUSEKEEPING` | Housekeeper role |
  | `VERIFY_CLEAN` | `ROOM_CLEANING_VERIFICATION` | Housekeepers with the Head Housekeeper privilege (individual grant) |
  | `SET_UNAVAILABLE`, `SET_MAINTENANCE` | `ROOM_OUT_OF_SERVICE` | Head Housekeeper privilege (individual grant) and General Manager role |
- **Scenario 2:** `Room.occupy()` accepts only `AVAILABLE`, so check-in is blocked for `DIRTY`, `CLEANING`, `UNAVAILABLE` and `MAINTENANCE` rooms.
- **Who triggers which actions:**
  - **Housekeeping and the General Manager:** stayover, cleaning, verification and out-of-service actions go through `POST /api/v1/rooms/{id}/state-transitions`.
  - **Front desk:** `CHECK_IN` and `CHECK_OUT` are triggered only by the check-in (US-13) and check-out (US-17) use cases.
- **Stayover requests:** the guest does not use the system. They ask a Housekeeper or the General Manager, who records the request.
- **Concurrency:** `Room.version` (optimistic locking) prevents two devices from applying conflicting transitions at the same time; the second one receives `409 Conflict`.
- **PENDING:**
  - how a room leaves `Unavailable` or `Maintenance` (to which state, e.g., `Dirty` or `Available`, and who can do it);
  - the difference between `Unavailable` and `Maintenance`;
  - what happens when an **Occupied** room is moved to `Unavailable` or `Maintenance` while a guest is In-House (e.g., moving the guest to another room);
  - whether out-of-service rooms are removed from sellable inventory (US-06) and from occupancy reports (US-23), and for which nights;
  - whether a reason or note is required when taking a room out of service;
  - the initial state of a newly registered room.

---

## 3. ER Diagram (PostgreSQL persistence)

```mermaid
erDiagram
    ROOM ||--o{ ROOM_STATE_HISTORY : "changes through"
    STAFF_MEMBER ||--o{ ROOM_STATE_HISTORY : "performs"
    RESERVATION |o--o| ROOM : "is In-House in"
    STAFF_MEMBER ||--o{ STAFF_PERMISSION_GRANT : "receives"
    PERMISSION ||--o{ STAFF_PERMISSION_GRANT : "is granted as"

    ROOM {
        uuid id PK "US-02"
        uuid property_id FK
        varchar state "CHECK IN (AVAILABLE, OCCUPIED, DIRTY, CLEANING, UNAVAILABLE, MAINTENANCE)"
        uuid in_house_reservation_id FK "nullable, UNIQUE, set at check-in, cleared at check-out"
        int version "optimistic locking"
    }
    ROOM_STATE_HISTORY {
        uuid id PK
        uuid room_id FK
        varchar from_state
        varchar to_state
        varchar transition "CHECK_IN, CHECK_OUT, REQUEST_STAYOVER_CLEANING, MARK_STAYOVER_CLEANED, START_CLEANING, VERIFY_CLEAN, SET_UNAVAILABLE, SET_MAINTENANCE"
        uuid changed_by_staff_id FK "nullable for system actions"
        timestamptz changed_at "UTC"
    }
    STAFF_PERMISSION_GRANT {
        uuid staff_member_id PK, FK
        varchar permission_code PK, FK "ROOM_CLEANING_VERIFICATION, ROOM_OUT_OF_SERVICE"
        uuid granted_by_staff_id FK "General Manager"
        timestamptz granted_at "UTC"
    }
    PERMISSION {
        varchar code PK "US-01"
    }
    RESERVATION {
        uuid id PK "partial: US-06"
    }
    STAFF_MEMBER {
        uuid id PK "US-01"
    }
```

### Design notes
- **Two new states:** `ROOM.state` now accepts `UNAVAILABLE` and `MAINTENANCE`.
- **`ROOM.in_house_reservation_id` is new:**
  - `UNIQUE`, so a reservation can be In-House in only one room;
  - a check constraint keeps it consistent: it must be set when `state = 'OCCUPIED'`, and it may only be set for `OCCUPIED` or `DIRTY` (stayover);
  - it also helps the housekeeping board (US-18) tell stayover rooms from vacated rooms.
- **Head Housekeeper privilege:** `STAFF_PERMISSION_GRANT` carries both privilege permissions, `ROOM_CLEANING_VERIFICATION` and `ROOM_OUT_OF_SERVICE`, granted by the General Manager to individual Housekeepers. The General Manager role has them through the role-permission matrix (US-01).
- **`ROOM_STATE_HISTORY`** keeps who did each action and when, written in the same transaction as the state change.

---

## 4. Event Flow

### 4.1 Cleaning after check-out and verification — Scenarios 1 and 3

```mermaid
sequenceDiagram
    autonumber
    actor HK as Housekeeper
    actor HH as Housekeeper with Head Housekeeper privilege
    participant View as RoomStateView<br/>POST /api/v1/rooms/{id}/state-transitions
    participant UC as ChangeRoomStateUseCase
    participant Perm as StaffPermissionQuery (US-01)
    participant Room as Room (DIRTY, no In-House guest)
    participant Bus as EventPublisher

    HK->>View: {action: START_CLEANING}
    View->>UC: execute(room, START_CLEANING, hk_id)
    UC->>Perm: has_permission(hk_id, HOUSEKEEPING)
    Perm-->>UC: true
    UC->>Room: start_cleaning(hk_id)
    Room->>Room: DIRTY to CLEANING (guard: no In-House guest)
    UC->>Bus: publish(RoomStateChanged), commit
    View-->>HK: 200 OK, CLEANING

    HH->>View: {action: VERIFY_CLEAN}
    View->>UC: execute(room, VERIFY_CLEAN, hh_id)
    UC->>Perm: has_permission(hh_id, ROOM_CLEANING_VERIFICATION)
    alt Privilege granted
        Perm-->>UC: true
        UC->>Room: verify_clean(hh_id)
        Room->>Room: CLEANING to AVAILABLE
        UC->>Bus: publish(RoomStateChanged), commit
        View-->>HH: 200 OK, AVAILABLE
    else No privilege
        Perm-->>UC: false
        UC-->>View: raise PermissionDeniedError
        View-->>HH: 403 Forbidden
    end
```

### 4.2 Stayover cleaning requested by the guest

```mermaid
sequenceDiagram
    autonumber
    actor Guest as Guest (In-House)
    actor Staff as Housekeeper or General Manager
    actor HK as Housekeeper
    participant View as RoomStateView<br/>POST /api/v1/rooms/{id}/state-transitions
    participant UC as ChangeRoomStateUseCase
    participant Room as Room (OCCUPIED, In-House guest)
    participant Bus as EventPublisher

    Guest->>Staff: Please clean my room
    Staff->>View: {action: REQUEST_STAYOVER_CLEANING}
    View->>UC: execute(room, REQUEST_STAYOVER_CLEANING, staff_id)
    UC->>UC: check STAYOVER_CLEANING permission
    UC->>Room: request_stayover_cleaning(staff_id)
    Room->>Room: OCCUPIED to DIRTY (guard: In-House guest present)
    UC->>Bus: publish(RoomStateChanged), commit
    View-->>Staff: 200 OK, DIRTY (stayover)

    HK->>HK: Cleans the room
    HK->>View: {action: MARK_STAYOVER_CLEANED}
    View->>UC: execute(room, MARK_STAYOVER_CLEANED, hk_id)
    UC->>UC: check HOUSEKEEPING permission
    UC->>Room: mark_stayover_cleaned(hk_id)
    alt Guest still In-House
        Room->>Room: DIRTY to OCCUPIED
        UC->>Bus: publish(RoomStateChanged), commit
        View-->>HK: 200 OK, OCCUPIED
    else Guest checked out meanwhile
        Room-->>UC: raise InvalidRoomTransitionError
        View-->>HK: 409 Conflict, follow the post-check-out cleaning flow (4.1)
    end
```

### 4.3 Taking a room out of service

```mermaid
sequenceDiagram
    autonumber
    actor Who as Head Housekeeper or General Manager
    participant View as RoomStateView<br/>POST /api/v1/rooms/{id}/state-transitions
    participant UC as ChangeRoomStateUseCase
    participant Perm as StaffPermissionQuery (US-01)
    participant Room as Room (any state)
    participant Bus as EventPublisher

    Who->>View: {action: SET_MAINTENANCE} or {action: SET_UNAVAILABLE}
    View->>UC: execute(room, action, staff_id)
    UC->>Perm: has_permission(staff_id, ROOM_OUT_OF_SERVICE)
    alt Not Head Housekeeper nor General Manager
        Perm-->>UC: false
        View-->>Who: 403 Forbidden
    else Allowed
        Perm-->>UC: true
        UC->>Room: take_out_of_service(MAINTENANCE or UNAVAILABLE, staff_id)
        Room->>Room: current state to MAINTENANCE / UNAVAILABLE
        UC->>Bus: publish(RoomStateChanged), commit
        View-->>Who: 200 OK, room cannot receive check-ins
    end
    Note over Who,Room: PENDING: leaving these states, and handling an Occupied room with a guest inside
```

### 4.4 Blocked check-in — Scenario 2

```mermaid
sequenceDiagram
    autonumber
    actor Agent as Front Desk Agent
    participant UC as CompleteCheckInUseCase (US-13)
    participant Svc as CheckInService (US-13)
    participant Room as Room (DIRTY, CLEANING, UNAVAILABLE or MAINTENANCE)

    Agent->>UC: Check guest into Room 101
    UC->>Svc: check_in(reservation, room, ...)
    Svc->>Room: occupy(reservation_id)
    Room-->>Svc: raise RoomNotAvailableError
    Svc-->>UC: error
    UC-->>Agent: 409 Conflict, room is not Available
```

### 4.5 Domain events

| Event | Emitted by | When | Payload | Consumers |
|---|---|---|---|---|
| `RoomStateChanged` | `Room` | Any allowed transition | `room_id`, `property_id`, `from_state`, `to_state`, `action`, `actor`, `occurred_at_utc` | Room state history (same transaction); real-time housekeeping board (US-18, after commit) |
