# US-08 — OTA Channel Mapping: Diagrams

> Source: `US-08-ota-channel-mapping.md`. Related: US-02 (properties and room types), US-07 (inbound bookings).

## Business rules reflected

| Rule (US-08) | Where it appears |
|---|---|
| No real-time inventory distribution; mappings only resolve inbound bookings | Only `ChannelMappingResolver` reads mappings; no outbound adapter |
| Two pre-loaded mock channels; the GM cannot add more | Seeded `OTA_CHANNEL` rows; no create endpoint |
| A mapping links a property's room type to a channel room code; no rate plans | `CHANNEL_MAPPING` columns |
| Each property is a separate listing with its own channel property code | `CHANNEL_PROPERTY` |
| A code maps to exactly one room type; a room type can map to several channels | `UNIQUE (channel_code, property_id, channel_room_code)` |
| Unmapped code: booking rejected and logged | `UnmappedChannelRoom` → US-07 log |
| GM only: add, edit, remove; removal does not affect existing reservations | `SETTINGS` permission; reservations store `room_type_id`, not the mapping |

---

## 1. Class Diagram (Clean Architecture)

```mermaid
classDiagram
    direction LR

    namespace Domain {
        class OtaChannel {
            <<Entity · seeded>>
            +str code
            +str name
        }
        class ChannelProperty {
            <<Entity>>
            +str channel_code
            +PropertyId property_id
            +str channel_property_code
        }
        class ChannelMapping {
            <<Entity>>
            +ChannelMappingId id
            +str channel_code
            +PropertyId property_id
            +RoomTypeId room_type_id
            +str channel_room_code
        }
        class MappingRepository {
            <<Port>>
            +find(channel, property_code, room_code) ChannelMapping
            +code_in_use(channel, property_id, room_code) bool
            +save(mapping) None
            +remove(id) None
        }
    }

    namespace Application {
        class CreateMappingUseCase
        class UpdateMappingUseCase
        class RemoveMappingUseCase
        class SetChannelPropertyCodeUseCase
        class ChannelMappingResolver {
            <<Application Service>>
            +resolve(channel, property_code, room_code) MappedRoomType
        }
    }

    namespace Infrastructure {
        class DjangoMappingRepository
    }

    namespace Interface {
        class MappingViews {
            <<REST · SETTINGS>>
            /api/v1/ota-channels
            /api/v1/ota-channels/code/properties
            /api/v1/ota-channels/code/mappings
        }
    }

    ChannelProperty --> OtaChannel
    ChannelMapping --> OtaChannel
    CreateMappingUseCase --> MappingRepository
    UpdateMappingUseCase --> MappingRepository
    RemoveMappingUseCase --> MappingRepository
    SetChannelPropertyCodeUseCase --> MappingRepository
    ChannelMappingResolver --> MappingRepository
    DjangoMappingRepository ..|> MappingRepository
    MappingViews --> CreateMappingUseCase
    MappingViews --> UpdateMappingUseCase
    MappingViews --> RemoveMappingUseCase
    MappingViews --> SetChannelPropertyCodeUseCase
```

### Design notes
- **Seed:** `BOOKING_COM_MOCK` ("Booking.com (mock)") and `EXPEDIA_MOCK` ("Expedia (mock)"). `/api/v1/ota-channels` is read-only.
- **Resolution:** the inbound `property_code` is matched against `CHANNEL_PROPERTY.channel_property_code` for that channel, then the room code against `CHANNEL_MAPPING` for that property.
- **Removal** deletes the mapping row only. Reservations keep their own `room_type_id`, so they are not affected; later bookings for that code are rejected as unmapped.
- **The room type must belong to the property** of the mapping and be active.

---

## 2. ER Diagram

```mermaid
erDiagram
    OTA_CHANNEL ||--o{ CHANNEL_PROPERTY : "lists"
    PROPERTY ||--o{ CHANNEL_PROPERTY : "listed as"
    OTA_CHANNEL ||--o{ CHANNEL_MAPPING : "uses"
    ROOM_TYPE ||--o{ CHANNEL_MAPPING : "mapped by"

    OTA_CHANNEL {
        varchar code PK "BOOKING_COM_MOCK, EXPEDIA_MOCK"
        varchar name
    }
    CHANNEL_PROPERTY {
        varchar channel_code PK, FK
        uuid property_id PK, FK
        varchar channel_property_code "UK with channel_code"
    }
    CHANNEL_MAPPING {
        uuid id PK
        varchar channel_code FK
        uuid property_id FK
        uuid room_type_id FK "same property"
        varchar channel_room_code "UK with channel_code and property_id"
        uuid updated_by FK
        timestamptz updated_at
    }
    ROOM_TYPE {
        uuid id PK "US-02"
        uuid property_id FK
    }
    PROPERTY {
        uuid id PK "US-02"
    }
```

---

## 3. Event Flow

### 3.1 Creating a mapping — Scenarios 1 and 3

```mermaid
sequenceDiagram
    autonumber
    actor GM as General Manager
    participant View as MappingViews
    participant UC as CreateMappingUseCase
    participant Repo as MappingRepository

    GM->>View: POST mapping (channel, property, room type, room code)
    View->>UC: execute(cmd)
    UC->>Repo: code_in_use(channel, property, room code)
    alt code already mapped
        UC-->>View: ChannelRoomCodeInUse
        View-->>GM: 409 code already in use
    else free
        UC->>Repo: save(mapping)
        View-->>GM: 201 Created
    end
```

### 3.2 Resolving an inbound booking — Scenarios 2 and 4

```mermaid
flowchart TD
    A["Inbound booking (US-07)"] --> B{Channel property code known?}
    B -- no --> X["Rejected and logged for the GM"]
    B -- yes --> C{Channel room code mapped for that property?}
    C -- no --> X
    C -- yes --> D["Property and room type resolved"]
```

### 3.3 Domain events

| Event | Raised when | Consumers |
|---|---|---|
| `ChannelMappingChanged` | GM adds, edits or removes a mapping | Audit log |
