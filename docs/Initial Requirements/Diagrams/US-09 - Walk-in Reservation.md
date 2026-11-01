# US-09 — Walk-in Reservation: Diagrams

> Sources: `US-09-walk-in-reservation.md`, `US-06-reservation-creation-with-secure-card-tokenization.md`, `docs/Business Modeling/Business Modeling.md` (Personas, Section 5), `CLAUDE.md`.
> Elements tagged **PENDING** depend on business rules not defined yet. They are placeholders in the design, not decisions.
> Data is scoped per **Property** (Business Modeling, Section 5) even where the story text does not mention it.

---

## 1. Class Diagram (Clean Architecture + Front-end)

```mermaid
classDiagram
    direction LR

    namespace Domain {
        class Reservation {
            <<Entity / Aggregate Root · US-06>>
            -ReservationId id
            -PropertyId property_id
            -BookingChannel channel
            -StaffMemberId | None created_by
        }
        class BookingChannel {
            <<Enumeration · US-06>>
            DIRECT
            OTA
            WALK_IN
        }
        class NoAvailabilityError {
            <<Domain Exception · US-06>>
        }
    }

    namespace Application {
        class CreateWalkInReservationUseCase {
            <<Use Case>>
            +execute(command: CreateWalkInReservationCommand) ReservationConfirmation
        }
        class CreateWalkInReservationCommand {
            <<DTO>>
            +UUID property_id
            +UUID room_type_id
            +date check_in_date
            +date check_out_date
            +GuestData guest
            +str guest_language
            +str | None payment_method_token
            +UUID staff_member_id
        }
        class CheckAvailabilityUseCase {
            <<Use Case · US-03>>
            +execute(property_id, check_in_date, check_out_date) list~AvailableRoomType~
        }
        class BookingService {
            <<Application Service · US-06>>
            +book(request: BookingRequest) Reservation
        }
        class UnitOfWork {
            <<Port>>
            +commit() None
            +rollback() None
        }
    }

    namespace Interface {
        class StaffReservationsView {
            <<REST Controller>>
            +post(request, property_id) Response
        }
        class RequiresPermission {
            <<Authorization Guard · US-01>>
            +check(request, permission: Permission) None
        }
    }

    namespace FrontEnd {
        class WalkInReservationForm {
            <<React Component · MantineUI>>
            +fields: dates, room type, guest data, language
            +onSubmit() void
        }
        class KeyboardShortcuts {
            <<Hook · Mantine useHotkeys>>
            +bind(shortcut: string, action: Function) void
        }
        class AvailabilityPicker {
            <<React Component>>
            +onSelect(roomType) void
        }
    }

    Reservation --> BookingChannel
    CreateWalkInReservationUseCase ..> CreateWalkInReservationCommand
    CreateWalkInReservationUseCase --> BookingService
    CreateWalkInReservationUseCase --> UnitOfWork
    CreateWalkInReservationUseCase ..> NoAvailabilityError : propagates
    StaffReservationsView --> RequiresPermission : RESERVATION_CREATE
    StaffReservationsView --> CreateWalkInReservationUseCase

    WalkInReservationForm --> KeyboardShortcuts
    WalkInReservationForm --> AvailabilityPicker
    AvailabilityPicker ..> CheckAvailabilityUseCase : GET availability
    WalkInReservationForm ..> StaffReservationsView : POST /api/v1/properties/{id}/reservations
```

### Design notes
- **Same rules as other bookings:** a walk-in is a reservation with `channel = WALK_IN` created through the same `BookingService` (US-06). Availability, optimistic locking, stay limits (1 to 5 nights) and localized taxes therefore match direct and OTA bookings.
- **`created_by`** records the Front Desk Agent who created the reservation. Creating reservations at the desk requires a `RESERVATION_CREATE` permission (role-permission matrix, US-01).
- **Property:** the reservation is created for the property where the agent is working (path parameter). How staff are assigned to properties is PENDING.
- **Keyboard-only operation (Scenario 3):**
  - the form follows a linear tab order, and every field is a native or MantineUI input reachable with `Tab`/`Shift+Tab`;
  - the room type is chosen with the arrow keys plus `Enter`;
  - `Ctrl+Enter` submits;
  - `KeyboardShortcuts` uses MantineUI's `useHotkeys` hook, so no extra library is needed;
  - the exact shortcut set is a UI proposal to confirm.
- **`payment_method_token` is optional** because whether walk-ins go through card tokenization and T&C acceptance, and how cash guests are handled (including the deposit), are PENDING.

---

## 2. ER Diagram (PostgreSQL persistence)

```mermaid
erDiagram
    STAFF_MEMBER ||--o{ RESERVATION : "creates (walk-in)"
    PROPERTY ||--o{ RESERVATION : "receives"

    RESERVATION {
        uuid id PK "full model in US-06"
        uuid property_id FK
        varchar channel "WALK_IN"
        uuid created_by_staff_id FK "nullable, set for walk-ins"
        varchar payment_method_token "nullable for walk-ins, PENDING"
    }
    STAFF_MEMBER {
        uuid id PK "partial: US-01"
    }
    PROPERTY {
        uuid id PK "partial"
    }
```

### Design notes
- **No new table.** A walk-in reuses `RESERVATION`, `RESERVATION_NIGHT`, `RESERVATION_TAX_LINE` and `ROOM_INVENTORY` from US-06.
- **New column:** `created_by_staff_id` is added to `RESERVATION`, for traceability of desk sales.
- **`CHECK` constraint:** `payment_method_token` may be null only when `channel = 'WALK_IN'`. Direct bookings always carry a token (US-06).

---

## 3. Event Flow

### 3.1 Walk-in reservation — Scenarios 1 and 2

```mermaid
sequenceDiagram
    autonumber
    actor Agent as Front Desk Agent
    participant Form as WalkInReservationForm
    participant Avail as CheckAvailabilityUseCase (US-03)
    participant View as StaffReservationsView<br/>POST /api/v1/properties/{id}/reservations
    participant UC as CreateWalkInReservationUseCase
    participant Book as BookingService (US-06)

    Agent->>Form: Enter stay dates
    Form->>Avail: GET availability for the dates
    alt No availability (Scenario 2)
        Avail-->>Form: []
        Form-->>Agent: No rooms available for these dates
    else Rooms available
        Avail-->>Form: available room types with totals
        Agent->>Form: Select room type, enter guest data, Ctrl+Enter
        Form->>View: POST walk-in reservation
        View->>UC: execute(command)
        UC->>Book: book(request, channel = WALK_IN)
        alt Room taken meanwhile
            Book-->>UC: raise NoAvailabilityError
            UC-->>View: error
            View-->>Form: 409 Conflict
            Form-->>Agent: Room no longer available
        else Booked (Scenario 1)
            Book-->>UC: Reservation with localized taxes
            UC->>UC: commit
            UC-->>View: ReservationConfirmation
            View-->>Form: 201 Created
            Form-->>Agent: Reservation created, ready for check-in (US-12)
        end
    end
```

### 3.2 Keyboard-only operation — Scenario 3

```mermaid
flowchart LR
    A[Focus: check-in date] -- Tab --> B[Check-out date]
    B -- Tab --> C[Room type list]
    C -- "Arrow keys + Enter" --> D[Guest name]
    D -- Tab --> E[Guest contact fields]
    E -- Tab --> F[Guest language EN/FR]
    F -- Tab --> G[Payment / deposit fields, PENDING]
    G -- "Ctrl+Enter" --> H[Submit reservation]
    H --> I{Result}
    I -- 201 --> J[Focus moves to check-in action]
    I -- "409 / 422" --> K[Focus moves to the first field with an error]
```

### 3.3 Domain events

| Event | Emitted by | When | Payload | Consumers |
|---|---|---|---|---|
| `ReservationCreated` | `BookingService` (US-06) | Walk-in reservation saved (`channel = WALK_IN`) | see US-06 | Folio creation (US-15); confirmation email to walk-ins is PENDING |
