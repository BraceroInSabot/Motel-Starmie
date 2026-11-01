# US-06 — Reservation Creation with Secure Card Tokenization: Diagrams

> Sources: `US-06-reservation-creation-with-secure-card-tokenization.md`, `US-03-availability-search.md`, `US-04-localized-tax-calculation.md`, `docs/Business Modeling/Business Modeling.md` (Phase 1, Section 4), `CLAUDE.md`.
> Elements tagged **PENDING** depend on business rules not defined yet. They are placeholders in the design, not decisions.
> Data is scoped per **Property** (Business Modeling, Section 5) even where the story text does not mention it.

---

## 1. Class Diagram (Clean Architecture + Front-end)

```mermaid
classDiagram
    direction LR

    namespace Domain {
        class Reservation {
            <<Entity / Aggregate Root>>
            -ReservationId id
            -PropertyId property_id
            -RoomTypeId room_type_id
            -GuestProfileId guest_profile_id
            -StayPeriod stay
            -BookingChannel channel
            -ReservationStatus status
            -Language guest_language
            -PaymentMethodToken payment_method_token
            -PriceBreakdown price
            -int version
            +create(...)$ Reservation
        }
        class StayPeriod {
            <<Value Object>>
            +date check_in_date
            +date check_out_date
            +nights() list~date~
        }
        class PriceBreakdown {
            <<Value Object>>
            +Money room_total
            +list~TaxLine~ taxes
            +Money grand_total
        }
        class Money {
            <<Value Object · US-04>>
            +Decimal amount
            +Currency currency
        }
        class TaxLine {
            <<Value Object · US-04>>
            +str tax_code
            +Decimal rate
            +Money amount
        }
        class PaymentMethodToken {
            <<Value Object>>
            +str gateway
            +str token
        }
        class BookingChannel {
            <<Enumeration>>
            DIRECT
            OTA
            WALK_IN
        }
        class ReservationStatus {
            <<Enumeration · US-11>>
            UNCONFIRMED
            CONFIRMED
            IN_HOUSE
            CHECKED_OUT
            CANCELED
            NO_SHOW
        }
        class RoomInventory {
            <<Entity / Aggregate Root>>
            -RoomTypeId room_type_id
            -date stay_date
            -int total_rooms
            -int reserved_rooms
            -int version
            +reserve_one() None
        }
        class ReservationCreated {
            <<Domain Event>>
            +ReservationId reservation_id
            +PropertyId property_id
            +BookingChannel channel
            +Language guest_language
            +datetime occurred_at_utc
        }
        class InvalidStayPeriodError {
            <<Domain Exception>>
        }
        class NoAvailabilityError {
            <<Domain Exception>>
        }
    }

    namespace Application {
        class CreateReservationUseCase {
            <<Use Case>>
            +execute(command: CreateReservationCommand) ReservationConfirmation
        }
        class BookingService {
            <<Application Service · shared by US-06, US-07, US-09>>
            +book(request: BookingRequest) Reservation
        }
        class CreateReservationCommand {
            <<DTO>>
            +UUID property_id
            +UUID room_type_id
            +date check_in_date
            +date check_out_date
            +GuestData guest
            +str language
            +str payment_method_token
            +PolicyAcceptance terms
        }
        class ReservationConfirmation {
            <<DTO>>
            +UUID reservation_id
            +str confirmation_code
            +str status
            +PriceBreakdown price
        }
        class SendConfirmationOnReservationCreated {
            <<Event Handler>>
            +handle(event: ReservationCreated) None
        }
        class CreateFolioOnReservationCreated {
            <<Event Handler · US-15>>
            +handle(event: ReservationCreated) None
        }
        class ReservationRepository {
            <<Port>>
            +add(reservation: Reservation) None
        }
        class RoomInventoryRepository {
            <<Port>>
            +get_for_nights(room_type_id: RoomTypeId, nights: list~date~) list~RoomInventory~
            +save_with_version_check(items: list~RoomInventory~) None
        }
        class RateProvider {
            <<Port · rate structure US-03>>
            +nightly_rates(room_type_id: RoomTypeId, nights: list~date~) list~Money~
        }
        class TaxCalculator {
            <<Port · US-04>>
            +calculate(property_id: PropertyId, base: Money, on_date: date) list~TaxLine~
        }
        class GuestProfileRepository {
            <<Port · US-20>>
            +add(profile: GuestProfile) None
        }
        class GuestCommunicationService {
            <<Application Service · Staff Interface Language diagram>>
            +send(recipient, guest_language, template_key, context) None
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
        class DjangoReservationRepository {
            <<Adapter>>
        }
        class DjangoRoomInventoryRepository {
            <<Adapter · optimistic locking>>
        }
        class DjangoUnitOfWork {
            <<Adapter>>
        }
    }

    namespace Interface {
        class ReservationsView {
            <<REST Controller>>
            +post(request) Response
        }
    }

    namespace FrontEnd {
        class PaymentStep {
            <<React Component>>
            +onConfirm() void
        }
        class GatewayHostedFields {
            <<Gateway SDK · Stripe or Adyen Elements, PENDING>>
            +tokenize() Promise~token~
        }
    }

    Reservation *-- StayPeriod
    Reservation *-- PriceBreakdown
    Reservation *-- PaymentMethodToken
    Reservation --> BookingChannel
    Reservation --> ReservationStatus
    PriceBreakdown *-- Money
    PriceBreakdown *-- TaxLine
    StayPeriod ..> InvalidStayPeriodError : raises
    RoomInventory ..> NoAvailabilityError : raises
    Reservation ..> ReservationCreated : records

    CreateReservationUseCase ..> CreateReservationCommand
    CreateReservationUseCase ..> ReservationConfirmation
    CreateReservationUseCase --> BookingService
    CreateReservationUseCase --> UnitOfWork
    BookingService --> RoomInventoryRepository
    BookingService --> RateProvider
    BookingService --> TaxCalculator
    BookingService --> ReservationRepository
    BookingService --> GuestProfileRepository
    BookingService --> EventPublisher
    SendConfirmationOnReservationCreated --> GuestCommunicationService
    SendConfirmationOnReservationCreated ..> ReservationCreated : handles
    CreateFolioOnReservationCreated ..> ReservationCreated : handles

    DjangoReservationRepository ..|> ReservationRepository
    DjangoRoomInventoryRepository ..|> RoomInventoryRepository
    DjangoUnitOfWork ..|> UnitOfWork
    ReservationsView --> CreateReservationUseCase

    PaymentStep --> GatewayHostedFields
    PaymentStep ..> ReservationsView : POST /api/v1/reservations with token
```

### Design notes
- **Card data never reaches the back end (PCI-DSS):**
  - `GatewayHostedFields` (Stripe or Adyen Elements, gateway PENDING) is rendered by the gateway inside the page and returns a token;
  - the back end only ever receives and stores `PaymentMethodToken`.
- **`BookingService` is the single booking core.** Availability, price, taxes, inventory reservation and reservation creation happen in one place, reused by direct bookings (US-06), OTA bookings (US-07) and walk-ins (US-09). This is how "the same availability, concurrency and tax rules" are guaranteed.
- **`StayPeriod`** enforces the US-03 rules: a minimum of 1 night and a maximum of 5 nights. Check-in is from 4:00 PM and check-out by 11:00 AM in the property's local time. The booking window is PENDING.
- **Scenario 3 (concurrency):**
  - `RoomInventory` is one row per room type per night;
  - `reserve_one()` increments `reserved_rooms` only while it is below `total_rooms`;
  - the repository saves with `WHERE version = :expected`, so if another transaction updated the row first, zero rows are affected and the whole transaction rolls back (`NoAvailabilityError`).
- **Money:** every amount is `Money` (`Decimal` plus currency), following US-04.
- **After commit:**
  - `ReservationCreated` triggers the folio creation (US-15), inside the same transaction;
  - it also triggers the confirmation email in the guest's language, which is sent only after commit so no email goes out for a rolled-back booking.
- **PENDING:**
  - initial status (`UNCONFIRMED` or `CONFIRMED`) and what confirms it;
  - whether any amount is charged at booking;
  - the booking window (how far ahead inventory rows exist).

---

## 2. ER Diagram (PostgreSQL persistence)

```mermaid
erDiagram
    PROPERTY ||--o{ RESERVATION : "receives"
    ROOM_TYPE ||--o{ RESERVATION : "is booked as"
    GUEST_PROFILE ||--o{ RESERVATION : "makes"
    RESERVATION ||--|{ RESERVATION_NIGHT : "occupies"
    RESERVATION ||--o{ RESERVATION_TAX_LINE : "is taxed by"
    ROOM_TYPE ||--o{ ROOM_INVENTORY : "is counted in"
    ROOM_INVENTORY ||--o{ RESERVATION_NIGHT : "is consumed by"

    RESERVATION {
        uuid id PK
        uuid property_id FK "NOT NULL"
        uuid room_type_id FK "NOT NULL"
        uuid guest_profile_id FK "NOT NULL"
        uuid room_id FK "nullable, assignment PENDING (US-13)"
        varchar confirmation_code UK
        varchar channel "DIRECT, OTA, WALK_IN"
        varchar status "US-11, initial value PENDING"
        date check_in_date
        date check_out_date "CHECK 1 to 5 nights"
        varchar guest_language "CHECK IN ('en','fr')"
        varchar payment_gateway "PENDING: stripe or adyen"
        varchar payment_method_token "gateway token, never card data"
        numeric room_total_amount "numeric(12,2)"
        numeric grand_total_amount "numeric(12,2)"
        char currency "CAD"
        int version "optimistic locking"
        timestamptz created_at "UTC"
        timestamptz updated_at "UTC"
    }
    RESERVATION_NIGHT {
        uuid reservation_id PK, FK
        date stay_date PK
        uuid room_inventory_id FK
        numeric nightly_rate_amount
        char currency
    }
    RESERVATION_TAX_LINE {
        uuid id PK
        uuid reservation_id FK
        varchar tax_code "GST, HST, PST, US-04"
        numeric rate "numeric(6,4)"
        numeric amount "numeric(12,2)"
        char currency
    }
    ROOM_INVENTORY {
        uuid id PK
        uuid property_id FK
        uuid room_type_id FK "UNIQUE (room_type_id, stay_date)"
        date stay_date
        int total_rooms
        int reserved_rooms "CHECK reserved_rooms <= total_rooms"
        int version "optimistic locking"
    }
    ROOM_TYPE {
        uuid id PK "partial: US-02"
    }
    GUEST_PROFILE {
        uuid id PK "partial: US-20"
    }
    PROPERTY {
        uuid id PK "partial"
    }
```

### Design notes
- **`ROOM_INVENTORY`** completes the partial table of the room registry: one row per room type and night. The check `reserved_rooms <= total_rooms` is the last line of defence against overbooking, and `version` supports the optimistic locking required by the business document.
- **`RESERVATION_NIGHT`** records which inventory nights a reservation consumes, so a cancellation (US-11) can release exactly those nights.
- **Money columns:** every amount is stored as `numeric(12,2)` next to a currency column (US-04 rule: value and currency together). No floating-point types are used.
- **`payment_method_token`** is only the gateway's reference. Card numbers, expiry dates and CVCs are never stored.

---

## 3. Event Flow

### 3.1 Successful reservation — Scenario 1

```mermaid
sequenceDiagram
    autonumber
    actor Guest
    participant Pay as PaymentStep
    participant GW as Payment Gateway (hosted fields)
    participant View as ReservationsView<br/>POST /api/v1/reservations
    participant UC as CreateReservationUseCase
    participant Book as BookingService
    participant Inv as RoomInventoryRepository
    participant Repo as ReservationRepository
    participant Bus as EventPublisher
    participant Mail as GuestCommunicationService

    Guest->>Pay: Enter card in secure fields, confirm
    Pay->>GW: tokenize()
    GW-->>Pay: payment_method_token
    Pay->>View: POST {stay, guest, language, token, terms}
    View->>UC: execute(CreateReservationCommand)
    UC->>UC: Validate terms acceptance (US-05)
    UC->>Book: book(request) inside UnitOfWork
    Book->>Inv: get_for_nights(room_type_id, nights)
    Inv-->>Book: RoomInventory rows
    Book->>Book: reserve_one() for each night
    Book->>Book: price = rates + taxes (US-03, US-04)
    Book->>Repo: add(reservation)
    Book->>Inv: save_with_version_check(rows)
    Book->>Bus: publish(ReservationCreated)
    Bus->>Bus: CreateFolioOnReservationCreated (US-15, same transaction)
    UC->>UC: commit
    UC-->>View: ReservationConfirmation
    View-->>Pay: 201 Created {confirmation_code, price}
    Bus->>Mail: after commit: send confirmation (guest_language)
    Mail-->>Guest: Confirmation email in EN or FR
```

### 3.2 Card tokenization fails — Scenario 2

```mermaid
sequenceDiagram
    autonumber
    actor Guest
    participant Pay as PaymentStep
    participant GW as Payment Gateway (hosted fields)
    participant View as ReservationsView

    Guest->>Pay: Enter card, confirm
    Pay->>GW: tokenize()
    GW-->>Pay: error (e.g., invalid or declined card)
    Pay-->>Guest: Failure message, no reservation created
    Note over Pay,View: No request reaches the back end, so no reservation or inventory change exists
```

### 3.3 Concurrent booking of the last room — Scenario 3

```mermaid
sequenceDiagram
    autonumber
    actor A as Guest A
    actor B as Guest B
    participant UC as CreateReservationUseCase
    participant DB as PostgreSQL (ROOM_INVENTORY)

    par Same moment
        A->>UC: Book last "Double Queen"
        UC->>DB: SELECT row (reserved=4, total=5, version=7)
    and
        B->>UC: Book last "Double Queen"
        UC->>DB: SELECT row (reserved=4, total=5, version=7)
    end
    UC->>DB: A: UPDATE reserved=5, version=8 WHERE version=7
    DB-->>UC: 1 row updated
    UC-->>A: 201 Created
    UC->>DB: B: UPDATE reserved=5, version=8 WHERE version=7
    DB-->>UC: 0 rows updated (version changed)
    UC->>UC: rollback B, raise NoAvailabilityError
    UC-->>B: 409 Conflict, room no longer available
```

### 3.4 Domain events

| Event | Emitted by | When | Payload | Consumers |
|---|---|---|---|---|
| `ReservationCreated` | `BookingService` | A reservation is saved (any channel) | `reservation_id`, `property_id`, `channel`, `guest_language`, `occurred_at_utc` | `CreateFolioOnReservationCreated` (US-15, same transaction); `SendConfirmationOnReservationCreated` (after commit) |
