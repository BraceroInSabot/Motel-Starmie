# US-07 — OTA Booking Ingestion via Channel Manager Webhook (mocked): Diagrams

> Source: `US-07-ota-booking-ingestion-via-channel-manager-webhook.md`. Related: US-06 (availability and concurrency), US-08 (channel mapping), US-15 (folio), US-20 (guest profile).

## Business rules reflected

| Rule (US-07) | Where it appears |
|---|---|
| OTA Booking ID is the idempotency key | `UNIQUE (channel_code, ota_booking_id)`, Scenario 2 |
| Same booking phase as direct bookings (availability, taxes) | Reuses `QuoteStayService` and `InventoryRepository` (US-06) |
| All OTA requests are mocked | `MockOtaSimulator` (command + dev screen) |
| The simulator posts to the real webhook endpoint | `OtaWebhookView` is the production endpoint |
| Payload fields (channel, OTA Booking ID, property code, channel room code, dates, guests, name, email, phone, language, amount paid) | `OtaBookingPayload` DTO |
| Mock data assumed valid; amount paid equals the system total | No amount reconciliation step |
| HMAC signature required, including in the mock | `HmacSignatureVerifier`, Scenario 5 |
| No Stripe charge; amount recorded as "OTA prepaid" | `Folio` payment type `OTA_PREPAID` |
| OTA bookings start Confirmed | `Reservation.status = CONFIRMED`, channel `OTA` |
| No availability: nothing created, error returned, logged for the GM | `OTA_INBOUND_LOG.outcome = REJECTED_NO_AVAILABILITY`, Scenario 4 |
| New bookings only; modifications and cancellations out of scope | Single event type accepted |
| PIPEDA consent recorded with source "OTA" | `GuestProfileService.register_or_update(..., source=OTA)` |
| No email to OTA guests | No `Notifier` call |

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
        class InboundOutcome {
            <<Enumeration>>
            CREATED
            DUPLICATE
            REJECTED_SIGNATURE
            REJECTED_UNMAPPED
            REJECTED_NO_AVAILABILITY
        }
        class Reservation {
            <<Aggregate Root · US-06>>
        }
        class Folio {
            <<Aggregate Root · US-15>>
            +post_payment(OTA_PREPAID, amount) None
        }
    }

    namespace Application {
        class OtaBookingPayload {
            <<DTO>>
            +str channel_code
            +str ota_booking_id
            +str property_code
            +str channel_room_code
            +date check_in
            +date check_out
            +int guests
            +str full_name
            +str email
            +str phone
            +Language language
            +Money amount_paid
        }
        class IngestOtaBookingUseCase {
            +execute(payload) IngestResult
        }
        class ChannelMappingResolver {
            <<Port · US-08>>
            +resolve(channel, property_code, room_code) MappedRoomType
        }
        class QuoteStayService {
            <<US-03, US-04>>
        }
        class InventoryRepository {
            <<Port · US-06>>
        }
        class GuestProfileService {
            <<US-20>>
        }
        class InboundLog {
            <<Port>>
            +record(channel, booking_id, outcome, payload) None
            +find(channel, booking_id) InboundEntry
        }
        class SignatureVerifier {
            <<Port>>
            +verify(raw_body, signature) bool
        }
    }

    namespace Infrastructure {
        class HmacSignatureVerifier {
            <<HMAC-SHA256 · shared secret>>
        }
        class DjangoInboundLog
        class MockOtaSimulator {
            <<Dev only · command and screen>>
            +send_booking(fields) None
        }
    }

    namespace Interface {
        class OtaWebhookView {
            <<REST · webhook>>
            POST /api/v1/webhooks/ota/bookings
        }
    }

    IngestOtaBookingUseCase ..> OtaBookingPayload
    IngestOtaBookingUseCase --> ChannelMappingResolver
    IngestOtaBookingUseCase --> QuoteStayService
    IngestOtaBookingUseCase --> InventoryRepository
    IngestOtaBookingUseCase --> GuestProfileService
    IngestOtaBookingUseCase --> InboundLog
    IngestOtaBookingUseCase ..> Reservation
    IngestOtaBookingUseCase ..> Folio
    InboundLog --> InboundOutcome
    HmacSignatureVerifier ..|> SignatureVerifier
    DjangoInboundLog ..|> InboundLog
    OtaWebhookView --> SignatureVerifier
    OtaWebhookView --> IngestOtaBookingUseCase
    MockOtaSimulator ..> OtaWebhookView : signed HTTP POST
```

### Design notes
- **The signature is checked on the raw body** before parsing. An invalid signature returns `401` and creates nothing (Scenario 5).
- **Idempotency (Scenario 2):** the use case first looks for an existing reservation with the same `(channel_code, ota_booking_id)`. If found, it returns the original result (`200` with the same reservation code) and logs `DUPLICATE`. The unique constraint also protects against two concurrent deliveries.
- **Same booking phase:** the room type comes from the mapping (US-08), then the stay is quoted with taxes and the nights are reserved with the same optimistic locking as US-06 (Scenario 3).
- **Folio:** the reservation is created `CONFIRMED` with channel `OTA`, and the amount paid is posted as an `OTA_PREPAID` payment (debit OTA receivable, US-15). No Stripe call and no email.
- **Rejections** (no availability, unmapped code) return `409` / `422` to the simulator and are written to `OTA_INBOUND_LOG`, which the GM can see.
- **Simulator:** `manage.py ota_simulate` and a dev-only screen build a payload, sign it with the shared secret from an environment variable and post it to the real endpoint. It is not deployed to production.

---

## 2. ER Diagram

```mermaid
erDiagram
    OTA_CHANNEL ||--o{ OTA_INBOUND_LOG : "sends"
    OTA_CHANNEL ||--o{ RESERVATION : "source of"
    RESERVATION ||--|| FOLIO : "has"

    OTA_CHANNEL {
        varchar code PK "US-08"
        varchar name
    }
    RESERVATION {
        uuid id PK "US-06"
        varchar channel "OTA"
        varchar status "starts CONFIRMED"
        varchar ota_channel_code FK
        varchar ota_booking_id "UK with ota_channel_code"
    }
    OTA_INBOUND_LOG {
        uuid id PK
        varchar channel_code FK
        varchar ota_booking_id
        varchar outcome "CREATED, DUPLICATE, REJECTED_*"
        uuid reservation_id FK "when CREATED or DUPLICATE"
        text error
        jsonb payload "kept for the GM log"
        timestamptz received_at
    }
    FOLIO {
        uuid id PK "US-15"
        uuid reservation_id FK
    }
```

---

## 3. Event Flow

### 3.1 Ingestion — Scenarios 1 to 5

```mermaid
sequenceDiagram
    autonumber
    participant Sim as MockOtaSimulator
    participant View as OtaWebhookView
    participant Sig as SignatureVerifier
    participant UC as IngestOtaBookingUseCase
    participant Map as ChannelMappingResolver
    participant Inv as InventoryRepository
    participant Log as InboundLog

    Sim->>View: POST signed payload
    View->>Sig: verify(raw body, signature)
    alt invalid signature
        View-->>Sim: 401, nothing created
    else valid
        View->>UC: execute(payload)
        UC->>UC: reservation with this OTA Booking ID exists?
        alt duplicate
            UC->>Log: DUPLICATE
            UC-->>Sim: 200 original result
        else new booking
            UC->>Map: resolve(channel, property code, room code)
            alt unmapped code
                UC->>Log: REJECTED_UNMAPPED
                UC-->>Sim: 422 rejected
            else mapped
                UC->>Inv: reserve each night (version check)
                alt no availability
                    UC->>Log: REJECTED_NO_AVAILABILITY
                    UC-->>Sim: 409 rejected
                else reserved
                    UC->>UC: guest profile (consent source OTA)<br/>reservation CONFIRMED, taxes applied<br/>folio OTA_PREPAID payment
                    UC->>Log: CREATED
                    UC-->>Sim: 201 Created
                end
            end
        end
    end
```

### 3.2 Domain events

| Event | Raised when | Consumers |
|---|---|---|
| `OtaReservationCreated` | Booking created | Front desk dashboard (US-10) |
| `OtaBookingRejected` | Unmapped code or no availability | GM log |
