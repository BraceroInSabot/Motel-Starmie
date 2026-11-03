# US-02 — Property, Room Type and Room Registry: Diagrams

> Source: `US-02-room-type-and-room-registry.md`. Related: US-01 (GM-only settings), US-03 (rates and availability), US-19 (room states).

## Business rules reflected

| Rule (US-02) | Where it appears |
|---|---|
| Two properties: Bedford (24 h desk) and Timberlea (8:00 AM–12:00 AM), NS, America/Halifax, CAD | Seed data, `Property`, `FrontDeskHours` |
| GM registers and edits properties: name, timezone, base currency, tax province, desk hours | `RegisterPropertyUseCase`, `PROPERTY` |
| A room type belongs to one property; a room belongs to one room type, in the same property | `RoomType.property_id`, `Room.room_type_id`, composite FK |
| No fixed number of rooms or room types | No limits in the model |
| Room type: name EN/FR, description EN/FR, max guests, bed configuration, amenities from a fixed list, optional photos | `RoomType`, `Amenity`, `ROOM_TYPE_PHOTO` |
| Room: number, room type, optional note | `Room`, `ROOM` |
| A new room starts Available | `Room.register()` sets `AVAILABLE` |
| Room type names and room numbers unique per property | `UNIQUE (property_id, name_en)`, `UNIQUE (property_id, name_fr)`, `UNIQUE (property_id, number)` |
| Edit and deactivate, never delete | No delete endpoint; `is_active` |
| An occupied room cannot be deactivated; a room type with active rooms cannot be deactivated | `Room.deactivate()`, `DeactivateRoomTypeUseCase` |
| Deactivated rooms and room types are not offered for booking or check-in | `is_active` filter used by US-03 and US-13 |

---

## 1. Class Diagram (Clean Architecture)

```mermaid
classDiagram
    direction LR

    namespace Domain {
        class Property {
            <<Aggregate Root>>
            +PropertyId id
            +str code
            +str name
            +ZoneInfo timezone
            +Currency base_currency
            +str tax_province
            +FrontDeskHours desk_hours
            +bool is_active
        }
        class FrontDeskHours {
            <<Value Object>>
            +bool is_24h
            +time opens_at
            +time closes_at
            +is_open(local_time) bool
        }
        class LocalizedText {
            <<Value Object>>
            +str en
            +str fr
        }
        class Amenity {
            <<Enumeration>>
            REFRIGERATOR
            MICROWAVE
            COFFEE_MAKER
            TV
            WIFI
        }
        class RoomType {
            <<Aggregate Root>>
            +RoomTypeId id
            +PropertyId property_id
            +LocalizedText name
            +LocalizedText description
            +int max_guests
            +str bed_configuration
            +set~Amenity~ amenities
            +list~PhotoRef~ photos
            +bool is_active
            +deactivate(active_room_count) None
        }
        class Room {
            <<Aggregate Root>>
            +RoomId id
            +PropertyId property_id
            +RoomTypeId room_type_id
            +str number
            +str note
            +RoomState state
            +bool is_active
            +register(room_type)$ Room
            +deactivate() None
        }
        class RoomState {
            <<Enumeration · US-19>>
            AVAILABLE
            OCCUPIED
            DIRTY
            CLEANING
            UNAVAILABLE
            MAINTENANCE
        }
        class PropertyRepository {
            <<Port>>
        }
        class RoomTypeRepository {
            <<Port>>
            +exists_name(property_id, name) bool
        }
        class RoomRepository {
            <<Port>>
            +exists_number(property_id, number) bool
            +count_active(room_type_id) int
        }
    }

    namespace Application {
        class RegisterPropertyUseCase
        class UpdatePropertyUseCase
        class RegisterRoomTypeUseCase
        class UpdateRoomTypeUseCase
        class DeactivateRoomTypeUseCase
        class RegisterRoomUseCase
        class UpdateRoomUseCase
        class DeactivateRoomUseCase
        class PhotoStorage {
            <<Port>>
        }
    }

    namespace Infrastructure {
        class DjangoPropertyRepository
        class DjangoRoomTypeRepository
        class DjangoRoomRepository
        class FileSystemPhotoStorage
    }

    namespace Interface {
        class PropertyViews {
            <<REST · SETTINGS>>
            /api/v1/properties
        }
        class RoomTypeViews {
            <<REST · SETTINGS>>
            /api/v1/properties/id/room-types
        }
        class RoomViews {
            <<REST · SETTINGS>>
            /api/v1/properties/id/rooms
        }
    }

    Property *-- FrontDeskHours
    RoomType *-- LocalizedText
    RoomType --> Amenity
    RoomType --> Property : belongs to
    Room --> RoomType : belongs to
    Room --> RoomState
    RegisterPropertyUseCase --> PropertyRepository
    RegisterRoomTypeUseCase --> RoomTypeRepository
    RegisterRoomTypeUseCase --> PhotoStorage
    DeactivateRoomTypeUseCase --> RoomRepository
    RegisterRoomUseCase --> RoomRepository
    RegisterRoomUseCase --> RoomTypeRepository
    DeactivateRoomUseCase --> RoomRepository
    DjangoPropertyRepository ..|> PropertyRepository
    DjangoRoomTypeRepository ..|> RoomTypeRepository
    DjangoRoomRepository ..|> RoomRepository
    FileSystemPhotoStorage ..|> PhotoStorage
    PropertyViews --> RegisterPropertyUseCase
    PropertyViews --> UpdatePropertyUseCase
    RoomTypeViews --> RegisterRoomTypeUseCase
    RoomTypeViews --> UpdateRoomTypeUseCase
    RoomTypeViews --> DeactivateRoomTypeUseCase
    RoomViews --> RegisterRoomUseCase
    RoomViews --> UpdateRoomUseCase
    RoomViews --> DeactivateRoomUseCase
```

### Design notes
- **All endpoints need the `SETTINGS` permission** (GM only, US-01). There is no `DELETE` endpoint: deactivation is `PATCH ... {"is_active": false}`.
- **`Room.deactivate()`** raises `RoomOccupied` when the state is `OCCUPIED` (Scenario 6). **`RoomType.deactivate()`** raises `RoomTypeHasActiveRooms` when `count_active(room_type_id) > 0`.
- **`RegisterRoomUseCase`** checks the room type exists, is active and belongs to the same property (Scenario 4), and that the number is free in that property (Scenario 5).
- **Rates** (base and weekend) belong to the room type but are specified in US-03; property policy settings (deposit, fees, grace period) are specified in US-11 and US-13.
- **Timberlea hours:** `closes_at = 00:00` means midnight; `is_open()` handles a closing time earlier than the opening time.

---

## 2. ER Diagram

```mermaid
erDiagram
    PROPERTY ||--o{ ROOM_TYPE : "has"
    PROPERTY ||--o{ ROOM : "has"
    ROOM_TYPE ||--o{ ROOM : "templates"
    ROOM_TYPE ||--o{ ROOM_TYPE_AMENITY : "offers"
    ROOM_TYPE ||--o{ ROOM_TYPE_PHOTO : "shows"

    PROPERTY {
        uuid id PK
        varchar code UK "e.g., BEDFORD, TIMBERLEA"
        varchar name
        varchar timezone "America/Halifax"
        char base_currency "CAD"
        varchar tax_province "NS"
        boolean desk_is_24h
        time desk_opens_at "null when 24 h"
        time desk_closes_at "null when 24 h"
        boolean is_active
    }
    ROOM_TYPE {
        uuid id PK
        uuid property_id FK
        varchar name_en "UK with property_id"
        varchar name_fr "UK with property_id"
        text description_en
        text description_fr
        smallint max_guests
        varchar bed_configuration
        boolean is_active
    }
    ROOM_TYPE_AMENITY {
        uuid room_type_id PK, FK
        varchar amenity PK "REFRIGERATOR, MICROWAVE, COFFEE_MAKER, TV, WIFI"
    }
    ROOM_TYPE_PHOTO {
        uuid id PK
        uuid room_type_id FK
        varchar file_key
        smallint position
    }
    ROOM {
        uuid id PK
        uuid property_id FK
        uuid room_type_id FK "same property"
        varchar number "UK with property_id"
        varchar note
        varchar state "starts AVAILABLE, US-19"
        boolean is_active
        int version "optimistic lock, US-19"
    }
```

### Design notes
- **Same-property rule:** `ROOM_TYPE` has `UNIQUE (id, property_id)` and `ROOM` has `FOREIGN KEY (room_type_id, property_id) REFERENCES ROOM_TYPE (id, property_id)`.
- Bedford and Timberlea are seeded by a data migration; the GM can edit them.

---

## 3. Event Flow

### 3.1 Room registration — Scenarios 3, 4 and 5

```mermaid
sequenceDiagram
    autonumber
    actor GM as General Manager
    participant View as RoomViews<br/>POST /api/v1/properties/{id}/rooms
    participant UC as RegisterRoomUseCase
    participant Types as RoomTypeRepository
    participant Rooms as RoomRepository

    GM->>View: number, room type, note
    View->>UC: execute(cmd)
    alt no room type given
        UC-->>View: RoomTypeRequired
        View-->>GM: 422 room type is mandatory
    else
        UC->>Types: get(room_type_id)
        UC->>Rooms: exists_number(property_id, number)
        alt number already used at this property
            UC-->>View: RoomNumberInUse
            View-->>GM: 409 room number already in use
        else
            UC->>Rooms: save(Room state = AVAILABLE)
            UC-->>View: RoomRegistered
            View-->>GM: 201 Created
        end
    end
```

### 3.2 Deactivation rules — Scenario 6

```mermaid
flowchart TD
    A[GM deactivates] --> B{Room or room type?}
    B -- room --> C{Room state is OCCUPIED?}
    C -- yes --> X1["409 room is occupied"]
    C -- no --> D["is_active = false<br/>not offered for booking or check-in"]
    B -- room type --> E{Room type has active rooms?}
    E -- yes --> X2["409 deactivate its rooms first"]
    E -- no --> F["is_active = false<br/>not offered for booking"]
```

### 3.3 Domain events

| Event | Raised when | Consumers |
|---|---|---|
| `PropertyRegistered` / `PropertyUpdated` | GM saves a property | Booking widget property list (US-03) |
| `RoomTypeRegistered` / `RoomTypeUpdated` / `RoomTypeDeactivated` | GM manages room types | Availability (US-03), OTA mapping (US-08) |
| `RoomRegistered` / `RoomDeactivated` | GM manages rooms | Availability (US-03), housekeeping board (US-18) |
