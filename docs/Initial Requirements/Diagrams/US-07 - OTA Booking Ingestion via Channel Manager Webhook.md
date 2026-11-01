# US-07 — OTA Booking Ingestion via Channel Manager Webhook: Diagrams

> Sources: `US-07-ota-booking-ingestion-via-channel-manager-webhook.md`, `US-08-ota-channel-mapping.md`, `docs/Business Modeling/Business Modeling.md` (Phase 1, Section 4 "Idempotent API Operations"), `CLAUDE.md`.
> Elements tagged **PENDING** depend on business rules not defined yet. They are placeholders in the design, not decisions.
> Data is scoped per **Property** (Business Modeling, Section 5) even where the story text does not mention it.

---

## 1. Class Diagram (Clean Architecture)

```mermaid
classDiagram
    direction LR

    namespace Domain {
        class OtaBookingId {
            <<Value Object>>
            +str channel_code
            +str value
        }
        class InboundOtaBooking {
            <<Value Object>>
            +OtaBookingId ota_booking_id
            +str channel_room_code
            +StayPeriod stay
            +GuestData guest
            +str language
        }
        class Reservation {
            <<Entity / Aggregate Root · US-06>>
            -ReservationId id
            -BookingChannel channel
            -OtaBookingId | None ota_booking_id
        }
        class WebhookReceipt {
            <<Entity>>
            -OtaBookingId ota_booking_id
            -ReservationId reservation_id
            -datetime first_received_at_utc
            -datetime last_received_at_utc
            -int delivery_count
            +register_duplicate(at_utc: datetime) None
        }
        class OtaBookingIngested {
            <<Domain Event>>
            +OtaBookingId ota_booking_id
            +ReservationId reservation_id
            +datetime occurred_at_utc
        }
        class DuplicateOtaBookingDetected {
            <<Domain Event>>
            +OtaBookingId ota_booking_id
            +int delivery_count
            +datetime occurred_at_utc
        }
        class InvalidWebhookSignatureError {
            <<Domain Exception>>
        }
        class UnmappedChannelRoomError {
            <<Domain Exception · US-08>>
        }
    }

    namespace Application {
        class IngestOtaBookingUseCase {
            <<Use Case>>
            +execute(booking: InboundOtaBooking) IngestionResult
        }
        class IngestionResult {
            <<DTO>>
            +UUID reservation_id
            +str confirmation_code
            +bool duplicate
        }
        class BookingService {
            <<Application Service · US-06>>
            +book(request: BookingRequest) Reservation
        }
        class ResolveChannelRoomUseCase {
            <<Use Case · US-08>>
            +execute(channel_code, channel_room_code) RoomTypeRef
        }
        class WebhookReceiptRepository {
            <<Port>>
            +find(ota_booking_id: OtaBookingId) WebhookReceipt | None
            +add(receipt: WebhookReceipt) None
            +save(receipt: WebhookReceipt) None
        }
        class ChannelPayloadTranslator {
            <<Port · payload contract PENDING>>
            +to_inbound_booking(raw_payload: bytes) InboundOtaBooking
        }
        class WebhookSignatureVerifier {
            <<Port · PENDING per channel manager>>
            +verify(headers: dict, raw_payload: bytes) None
        }
        class UnitOfWork {
            <<Port>>
            +commit() None
            +rollback() None
        }
        class EventPublisher {
            <<Port>>
            +publish(event: DomainEvent) None
        }
    }

    namespace Infrastructure {
        class ChannelManagerPayloadTranslator {
            <<Adapter · e.g., SiteMinder, PENDING>>
        }
        class ChannelManagerSignatureVerifier {
            <<Adapter · PENDING>>
        }
        class DjangoWebhookReceiptRepository {
            <<Adapter>>
        }
    }

    namespace Interface {
        class ChannelManagerWebhookView {
            <<REST Controller · webhook>>
            +post(request, channel_code) Response
        }
    }

    InboundOtaBooking *-- OtaBookingId
    Reservation --> OtaBookingId
    WebhookReceipt --> OtaBookingId
    IngestOtaBookingUseCase ..> OtaBookingIngested : emits
    IngestOtaBookingUseCase ..> DuplicateOtaBookingDetected : emits
    WebhookSignatureVerifier ..> InvalidWebhookSignatureError : raises
    ResolveChannelRoomUseCase ..> UnmappedChannelRoomError : raises

    IngestOtaBookingUseCase ..> IngestionResult
    IngestOtaBookingUseCase --> WebhookReceiptRepository
    IngestOtaBookingUseCase --> ResolveChannelRoomUseCase
    IngestOtaBookingUseCase --> BookingService
    IngestOtaBookingUseCase --> UnitOfWork
    IngestOtaBookingUseCase --> EventPublisher

    ChannelManagerPayloadTranslator ..|> ChannelPayloadTranslator
    ChannelManagerSignatureVerifier ..|> WebhookSignatureVerifier
    DjangoWebhookReceiptRepository ..|> WebhookReceiptRepository

    ChannelManagerWebhookView --> WebhookSignatureVerifier
    ChannelManagerWebhookView --> ChannelPayloadTranslator
    ChannelManagerWebhookView --> IngestOtaBookingUseCase
```

### Design notes
- **Idempotency key:** `OtaBookingId` (channel code plus the OTA Booking ID) is the idempotency key required by the business document.
- **`WebhookReceipt` stores the first outcome of each OTA Booking ID.** A repeated webhook finds the receipt and returns the **same** response (same reservation and confirmation code) without calling `BookingService` again (Scenario 2).
- **Concurrent duplicates:** the receipt key is `UNIQUE` in the database. If two identical webhooks arrive at the same time, one insert fails, its transaction rolls back, and the request is answered from the receipt the other one committed.
- **Scenario 3:** OTA bookings go through the same `BookingService` (US-06), so availability, optimistic locking and localized taxes are identical to direct bookings.
- **Anti-corruption layer:** the channel manager payload is translated at the edge by `ChannelPayloadTranslator`, so the domain never depends on the channel manager's format. The channel manager and its contract are PENDING (the document cites SiteMinder as an example).
- **Authenticity:** `WebhookSignatureVerifier` rejects requests that are not signed by the channel manager. The mechanism depends on the provider (PENDING).
- **Processing mode:** processing is synchronous within the webhook request. RabbitMQ could later queue webhooks behind the same use case without changing it, if the stack phase allows.
- **PENDING:**
  - modifications and cancellations sent by webhook;
  - what to do when there is no availability;
  - the HTTP status the channel manager expects in each case.

---

## 2. ER Diagram (PostgreSQL persistence)

```mermaid
erDiagram
    OTA_CHANNEL ||--o{ OTA_WEBHOOK_RECEIPT : "delivers"
    RESERVATION ||--o| OTA_WEBHOOK_RECEIPT : "is created from"
    OTA_CHANNEL ||--o{ RESERVATION : "sells"

    OTA_CHANNEL {
        varchar code PK "partial: US-08"
    }
    OTA_WEBHOOK_RECEIPT {
        varchar channel_code PK, FK
        varchar ota_booking_id PK "idempotency key"
        uuid reservation_id FK "UNIQUE"
        varchar payload_hash "SHA-256 of the first payload"
        timestamptz first_received_at "UTC"
        timestamptz last_received_at "UTC"
        int delivery_count
    }
    RESERVATION {
        uuid id PK "partial: US-06"
        varchar channel "OTA"
        varchar ota_channel_code FK "nullable"
        varchar ota_booking_id "nullable, UNIQUE (ota_channel_code, ota_booking_id)"
    }
```

### Design notes
- **Two layers of idempotency:**
  - `OTA_WEBHOOK_RECEIPT` (composite primary key) answers repeated deliveries;
  - `UNIQUE (ota_channel_code, ota_booking_id)` on `RESERVATION` guarantees no second reservation can exist even if a receipt is lost.
- **`payload_hash`** detects a redelivery whose content differs from the first one. Treating a different payload as a modification is PENDING.
- **Raw payloads are not stored, because they contain guest PII (PIPEDA).** Only the hash is kept.

---

## 3. Event Flow

### 3.1 New OTA booking — Scenarios 1 and 3

```mermaid
sequenceDiagram
    autonumber
    participant CM as Channel Manager
    participant View as ChannelManagerWebhookView<br/>POST /api/v1/webhooks/channel-manager/{channel}
    participant Sig as WebhookSignatureVerifier
    participant Tr as ChannelPayloadTranslator
    participant UC as IngestOtaBookingUseCase
    participant Rcpt as WebhookReceiptRepository
    participant Map as ResolveChannelRoomUseCase (US-08)
    participant Book as BookingService (US-06)
    participant Bus as EventPublisher

    CM->>View: POST booking payload
    View->>Sig: verify(headers, payload)
    alt Invalid signature
        Sig-->>View: raise InvalidWebhookSignatureError
        View-->>CM: 401 Unauthorized
    else Valid signature
        View->>Tr: to_inbound_booking(payload)
        Tr-->>View: InboundOtaBooking
        View->>UC: execute(booking)
        UC->>Rcpt: find(ota_booking_id)
        Rcpt-->>UC: None (first delivery)
        UC->>Map: execute(channel_code, channel_room_code)
        Map-->>UC: room_type (or UnmappedChannelRoomError)
        UC->>Book: book(request, channel = OTA) inside UnitOfWork
        alt Availability (Scenario 3)
            Book-->>UC: Reservation (taxes applied, inventory reserved)
            UC->>Rcpt: add(WebhookReceipt)
            UC->>Bus: publish(OtaBookingIngested)
            UC->>UC: commit
            UC-->>View: IngestionResult(duplicate = false)
            View-->>CM: 200 OK {reservation_id, confirmation_code}
        else No availability
            Book-->>UC: raise NoAvailabilityError
            UC->>UC: rollback
            Note over UC,CM: PENDING: response and handling when there is no availability
        end
    end
```

### 3.2 Duplicate webhook — Scenario 2

```mermaid
sequenceDiagram
    autonumber
    participant CM as Channel Manager
    participant View as ChannelManagerWebhookView
    participant UC as IngestOtaBookingUseCase
    participant Rcpt as WebhookReceiptRepository
    participant Bus as EventPublisher

    CM->>View: POST same booking again (network retry)
    View->>UC: execute(booking)
    UC->>Rcpt: find(ota_booking_id)
    Rcpt-->>UC: WebhookReceipt (reservation already created)
    UC->>UC: receipt.register_duplicate(now)
    UC->>Rcpt: save(receipt)
    UC->>Bus: publish(DuplicateOtaBookingDetected)
    UC-->>View: IngestionResult(same reservation, duplicate = true)
    View-->>CM: 200 OK {same reservation_id, same confirmation_code}
    Note over UC,Rcpt: BookingService is not called, so there is no new reservation and no inventory change
```

### 3.3 Two identical webhooks at the same moment

```mermaid
sequenceDiagram
    autonumber
    participant W1 as Webhook delivery 1
    participant W2 as Webhook delivery 2
    participant UC as IngestOtaBookingUseCase
    participant DB as PostgreSQL

    par Same moment
        W1->>UC: execute(booking X)
        UC->>DB: receipt X? none
    and
        W2->>UC: execute(booking X)
        UC->>DB: receipt X? none
    end
    UC->>DB: delivery 1: INSERT reservation and receipt X, commit
    DB-->>UC: ok
    UC-->>W1: 200 OK (reservation R)
    UC->>DB: delivery 2: INSERT receipt X
    DB-->>UC: unique violation
    UC->>UC: rollback delivery 2
    UC->>DB: read receipt X
    DB-->>UC: reservation R
    UC-->>W2: 200 OK (reservation R)
```

### 3.4 Domain events

| Event | Emitted by | When | Payload | Consumers |
|---|---|---|---|---|
| `ReservationCreated` | `BookingService` (US-06) | OTA reservation saved | see US-06 | Folio creation, confirmation email (sending to OTA guests is PENDING) |
| `OtaBookingIngested` | `IngestOtaBookingUseCase` | First delivery processed | `ota_booking_id`, `reservation_id`, `occurred_at_utc` | PENDING |
| `DuplicateOtaBookingDetected` | `IngestOtaBookingUseCase` | Repeated delivery received | `ota_booking_id`, `delivery_count`, `occurred_at_utc` | PENDING (e.g., monitoring) |
