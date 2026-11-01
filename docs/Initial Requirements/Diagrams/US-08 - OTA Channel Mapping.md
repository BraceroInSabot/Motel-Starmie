# US-08 — OTA Channel Mapping: Diagrams

> Sources: `US-08-ota-channel-mapping.md`, `US-07-ota-booking-ingestion-via-channel-manager-webhook.md`, `docs/Business Modeling/Business Modeling.md` (Personas, Section 5), `CLAUDE.md`.
> Elements tagged **PENDING** depend on business rules not defined yet. They are placeholders in the design, not decisions.
> Data is scoped per **Property** (Business Modeling, Section 5) even where the story text does not mention it.

---

## 1. Class Diagram (Clean Architecture)

```mermaid
classDiagram
    direction LR

    namespace Domain {
        class OtaChannel {
            <<Entity>>
            -ChannelCode code
            -str name
        }
        class ChannelCode {
            <<Value Object>>
            +str value
        }
        class ChannelRoomMapping {
            <<Entity / Aggregate Root>>
            -MappingId id
            -PropertyId property_id
            -RoomTypeId room_type_id
            -ChannelCode channel_code
            -str | None channel_property_code
            -str channel_room_code
            +create(...)$ ChannelRoomMapping
        }
        class ChannelRoomMapped {
            <<Domain Event>>
            +MappingId mapping_id
            +RoomTypeId room_type_id
            +ChannelCode channel_code
            +str channel_room_code
            +datetime occurred_at_utc
        }
        class ChannelRoomAlreadyMappedError {
            <<Domain Exception>>
        }
        class UnmappedChannelRoomError {
            <<Domain Exception>>
        }
        class UnknownChannelError {
            <<Domain Exception>>
        }
    }

    namespace Application {
        class CreateChannelMappingUseCase {
            <<Use Case>>
            +execute(command: CreateChannelMappingCommand) MappingId
        }
        class ListChannelMappingsUseCase {
            <<Use Case>>
            +execute(property_id: PropertyId) list~ChannelMappingView~
        }
        class ResolveChannelRoomUseCase {
            <<Use Case · used by US-07>>
            +execute(channel_code, channel_room_code, channel_property_code) RoomTypeRef
        }
        class CreateChannelMappingCommand {
            <<DTO>>
            +UUID property_id
            +UUID room_type_id
            +str channel_code
            +str | None channel_property_code
            +str channel_room_code
        }
        class ChannelMappingView {
            <<DTO>>
            +UUID id
            +str room_type_name
            +str channel_code
            +str channel_room_code
        }
        class RoomTypeRef {
            <<DTO>>
            +UUID property_id
            +UUID room_type_id
        }
        class ChannelMappingRepository {
            <<Port>>
            +add(mapping: ChannelRoomMapping) None
            +find_by_channel_room(channel_code, channel_property_code, channel_room_code) ChannelRoomMapping | None
            +list_by_property(property_id: PropertyId) list~ChannelRoomMapping~
        }
        class OtaChannelRepository {
            <<Port>>
            +get(code: ChannelCode) OtaChannel
        }
        class RoomTypeRepository {
            <<Port · US-02>>
            +get_by_id(room_type_id: RoomTypeId) RoomType
        }
        class ChannelInventoryPublisher {
            <<Port · PENDING push of availability and rates>>
            +push_availability(room_type_id: RoomTypeId, nights: list~date~) None
        }
        class EventPublisher {
            <<Port>>
            +publish(event: DomainEvent) None
        }
    }

    namespace Infrastructure {
        class DjangoChannelMappingRepository {
            <<Adapter>>
        }
        class DjangoOtaChannelRepository {
            <<Adapter>>
        }
        class ChannelManagerInventoryClient {
            <<Adapter · PENDING>>
        }
    }

    namespace Interface {
        class ChannelMappingsView {
            <<REST Controller>>
            +post(request, property_id) Response
            +get(request, property_id) Response
        }
    }

    OtaChannel *-- ChannelCode
    ChannelRoomMapping --> ChannelCode
    ChannelRoomMapping ..> ChannelRoomMapped : records

    CreateChannelMappingUseCase ..> CreateChannelMappingCommand
    CreateChannelMappingUseCase --> ChannelMappingRepository
    CreateChannelMappingUseCase --> OtaChannelRepository
    CreateChannelMappingUseCase --> RoomTypeRepository
    CreateChannelMappingUseCase --> EventPublisher
    CreateChannelMappingUseCase ..> ChannelRoomAlreadyMappedError : raises
    CreateChannelMappingUseCase ..> UnknownChannelError : raises
    ListChannelMappingsUseCase --> ChannelMappingRepository
    ListChannelMappingsUseCase ..> ChannelMappingView
    ResolveChannelRoomUseCase --> ChannelMappingRepository
    ResolveChannelRoomUseCase ..> RoomTypeRef
    ResolveChannelRoomUseCase ..> UnmappedChannelRoomError : raises

    DjangoChannelMappingRepository ..|> ChannelMappingRepository
    DjangoOtaChannelRepository ..|> OtaChannelRepository
    ChannelManagerInventoryClient ..|> ChannelInventoryPublisher
    ChannelMappingsView --> CreateChannelMappingUseCase
    ChannelMappingsView --> ListChannelMappingsUseCase
```

### Design notes
- **What a mapping links:** a `ChannelRoomMapping` connects a channel's room code to a room type of one property. The room type's property is copied into the mapping, so an inbound booking (US-07) always resolves to a property **and** a room type.
- **Uniqueness:** a channel room code can point to only one room type (`ChannelRoomAlreadyMappedError`). Otherwise an inbound booking would be ambiguous.
- **`channel_property_code` is PENDING.** It is filled only if each property is a separate listing in the channel manager (Business Modeling, Section 5).
- **`ChannelInventoryPublisher` is drawn but PENDING.** The story only states "real-time inventory distribution"; whether availability and rates are pushed to channels, and the mapping granularity (room type or rate plan), are undefined.
- **Supported channels (PENDING):** they are reference data in `OTA_CHANNEL`, so adding one is data, not code.
- **Permission:** writes are restricted to the General Manager (OTA channel mapping is in the General Manager persona). A dedicated `CHANNEL_MANAGEMENT` permission is added to the role-permission matrix (US-01).

---

## 2. ER Diagram (PostgreSQL persistence)

```mermaid
erDiagram
    OTA_CHANNEL ||--o{ CHANNEL_ROOM_MAPPING : "maps"
    PROPERTY ||--o{ CHANNEL_ROOM_MAPPING : "is listed by"
    ROOM_TYPE ||--o{ CHANNEL_ROOM_MAPPING : "is mapped by"

    OTA_CHANNEL {
        varchar code PK "list of channels PENDING"
        varchar name
        boolean is_active
    }
    CHANNEL_ROOM_MAPPING {
        uuid id PK
        uuid property_id FK "NOT NULL, composite FK with room_type_id"
        uuid room_type_id FK "NOT NULL"
        varchar channel_code FK "NOT NULL"
        varchar channel_property_code "nullable, PENDING"
        varchar channel_room_code "UNIQUE (channel_code, channel_property_code, channel_room_code)"
        timestamptz created_at "UTC"
    }
    ROOM_TYPE {
        uuid id PK "partial: US-02"
        uuid property_id FK
    }
    PROPERTY {
        uuid id PK "partial"
    }
```

### Design notes
- **Same property guaranteed:** the composite foreign key `(room_type_id, property_id) REFERENCES room_type (id, property_id)` makes the mapping's property always match the room type's property.
- **Unique key with a nullable column:** the unique key includes `channel_property_code`. PostgreSQL 15+ `UNIQUE NULLS NOT DISTINCT` keeps it strict while that column is null.
- **Rate plans:** if the granularity is per rate plan (PENDING), a `rate_plan_code` column joins the unique key.

---

## 3. Event Flow

### 3.1 Creating a mapping — Scenario 1

```mermaid
sequenceDiagram
    autonumber
    actor GM as General Manager
    participant View as ChannelMappingsView<br/>POST /api/v1/properties/{property_id}/channel-mappings
    participant UC as CreateChannelMappingUseCase
    participant Ch as OtaChannelRepository
    participant RT as RoomTypeRepository
    participant Repo as ChannelMappingRepository
    participant Bus as EventPublisher

    GM->>View: POST {room_type_id, channel_code, channel_room_code}
    Note over GM,View: Requires CHANNEL_MANAGEMENT (403 otherwise, US-01 flow)
    View->>UC: execute(command)
    UC->>Ch: get(channel_code)
    alt Unknown channel
        Ch-->>UC: raise UnknownChannelError
        UC-->>View: error
        View-->>GM: 422 Unprocessable Entity
    else Channel exists
        UC->>RT: get_by_id(room_type_id)
        RT-->>UC: RoomType (property must match path)
        UC->>Repo: find_by_channel_room(channel, property code, room code)
        alt Channel room already mapped
            Repo-->>UC: existing mapping
            UC-->>View: raise ChannelRoomAlreadyMappedError
            View-->>GM: 409 Conflict
        else Free
            Repo-->>UC: None
            UC->>Repo: add(mapping)
            UC->>Bus: publish(ChannelRoomMapped)
            UC-->>View: mapping_id
            View-->>GM: 201 Created
        end
    end
```

### 3.2 Resolving an inbound booking — Scenario 2

```mermaid
sequenceDiagram
    autonumber
    participant Ingest as IngestOtaBookingUseCase (US-07)
    participant UC as ResolveChannelRoomUseCase
    participant Repo as ChannelMappingRepository

    Ingest->>UC: execute(channel_code, channel_room_code, channel_property_code)
    UC->>Repo: find_by_channel_room(...)
    alt Mapping found
        Repo-->>UC: ChannelRoomMapping
        UC-->>Ingest: RoomTypeRef(property_id, room_type_id)
        Note over Ingest: Booking continues in the mapped property and room type
    else No mapping
        Repo-->>UC: None
        UC-->>Ingest: raise UnmappedChannelRoomError
        Note over Ingest: PENDING: how an unmapped booking is handled and answered
    end
```

### 3.3 Domain events

| Event | Emitted by | When | Payload | Consumers |
|---|---|---|---|---|
| `ChannelRoomMapped` | `CreateChannelMappingUseCase` | A mapping is saved | `mapping_id`, `room_type_id`, `channel_code`, `channel_room_code`, `occurred_at_utc` | PENDING (e.g., initial availability push, if pushing is confirmed) |
