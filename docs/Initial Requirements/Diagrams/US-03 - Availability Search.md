# US-03 — Availability Search: Diagrams

> Source: `US-03-availability-search.md`. Related: US-02 (room types and rooms), US-04 (taxes), US-06 (inventory and concurrency), US-19 (out-of-service rooms).

## Business rules reflected

| Rule (US-03) | Where it appears |
|---|---|
| Property first, then dates and number of guests; only that property's room types | `SearchAvailabilityQuery.property_id`, route per property |
| Bilingual widget (EN/FR) | `language` parameter; `LocalizedText` in the result |
| Availability checked against room type inventory with concurrency control (US-06) | `AvailabilityReadModel`, `ROOM_INVENTORY` |
| Only room types with max guests ≥ requested guests | Capacity filter in `SearchAvailabilityUseCase` |
| Nightly base rate and optional weekend rate (Friday and Saturday nights), set by the GM | `RoomTypeRate`, `NightlyRatePolicy` |
| Rates exclude taxes; taxes calculated separately (US-04) | `TaxEngine` port |
| Amounts in CAD | `Money` with currency |
| Check-in from 4:00 PM, check-out by 11:00 AM | `StayPolicy` constants shown in the result |
| Stays of 1 to 5 nights | `StayDates` validation (Scenario 4) |
| Same day up to 365 days ahead, in the property's local days | `StayDates` validation with the property's `Clock` |
| Result: name, description, photos, amenities, price of each night, taxes, total | `RoomTypeOffer` DTO |
| Deactivated, Unavailable and Maintenance rooms are not offered | `sellable_rooms` count |

---

## 1. Class Diagram (Clean Architecture)

```mermaid
classDiagram
    direction LR

    namespace Domain {
        class StayDates {
            <<Value Object>>
            +date check_in
            +date check_out
            +MIN_NIGHTS = 1
            +MAX_NIGHTS = 5
            +MAX_DAYS_AHEAD = 365
            +nights() list~date~
            +validate(today_local) None
        }
        class Money {
            <<Value Object>>
            +Decimal amount
            +Currency currency
        }
        class RoomTypeRate {
            <<Value Object>>
            +Money base_rate
            +Money weekend_rate
        }
        class NightlyRatePolicy {
            <<Domain Service>>
            +price(rate, night) Money
        }
        class StayPolicy {
            <<Value Object>>
            +CHECK_IN_FROM = 16:00
            +CHECK_OUT_BY = 11:00
        }
        class TaxEngine {
            <<Domain Service · US-04>>
            +taxes_for_night(property, night, rate) list~TaxLine~
        }
    }

    namespace Application {
        class SearchAvailabilityQuery {
            <<DTO>>
            +PropertyId property_id
            +StayDates dates
            +int guests
            +Language language
        }
        class SearchAvailabilityUseCase {
            <<Query Use Case>>
            +execute(query) list~RoomTypeOffer~
        }
        class RoomTypeOffer {
            <<DTO>>
            +RoomTypeId room_type_id
            +str name
            +str description
            +list~str~ photo_urls
            +list~Amenity~ amenities
            +list~NightPrice~ nights
            +list~TaxLine~ taxes
            +Money total
        }
        class NightPrice {
            <<DTO>>
            +date night
            +Money rate
        }
        class AvailabilityReadModel {
            <<Port>>
            +available_room_types(property_id, nights, guests) list~RoomTypeRow~
        }
        class Clock {
            <<Port>>
            +today(timezone) date
        }
    }

    namespace Infrastructure {
        class PostgresAvailabilityReadModel {
            <<Adapter · SQL>>
        }
    }

    namespace Interface {
        class AvailabilityView {
            <<REST · public>>
            GET /api/v1/properties/id/availability
        }
    }

    RoomTypeRate *-- Money
    NightlyRatePolicy ..> RoomTypeRate
    SearchAvailabilityUseCase --> AvailabilityReadModel
    SearchAvailabilityUseCase --> NightlyRatePolicy
    SearchAvailabilityUseCase --> TaxEngine
    SearchAvailabilityUseCase --> Clock
    SearchAvailabilityUseCase ..> SearchAvailabilityQuery
    SearchAvailabilityUseCase ..> RoomTypeOffer
    SearchAvailabilityQuery *-- StayDates
    RoomTypeOffer *-- NightPrice
    PostgresAvailabilityReadModel ..|> AvailabilityReadModel
    AvailabilityView --> SearchAvailabilityUseCase
```

### Design notes
- **`NightlyRatePolicy.price()`** returns `weekend_rate` for Friday and Saturday nights when it is set, otherwise `base_rate` (Scenario 5: base $100, weekend $130, Thursday to Sunday → $100 + $130 + $130 before taxes).
- **`StayDates.validate()`** rejects 0 nights, more than 5 nights (Scenario 4), a check-in before today or more than 365 days ahead. "Today" is the property's local date.
- **Availability per night** = `sellable_rooms` − `ROOM_INVENTORY.reserved_count`, where `sellable_rooms` counts the room type's active rooms that are not `UNAVAILABLE` or `MAINTENANCE`. A room type is listed only if every night has at least one room left.
- **The search is read-only.** It never takes a lock; the concurrency check happens when the reservation is created (US-06).
- **Rates** are stored on the room type (`base_rate_amount`, `weekend_rate_amount`) and edited by the GM in the settings (US-02 screens, `SETTINGS` permission).

---

## 2. ER Diagram

```mermaid
erDiagram
    PROPERTY ||--o{ ROOM_TYPE : "has"
    ROOM_TYPE ||--o{ ROOM : "templates"
    ROOM_TYPE ||--o{ ROOM_INVENTORY : "counted per night"

    ROOM_TYPE {
        uuid id PK "US-02"
        uuid property_id FK
        smallint max_guests "capacity filter"
        numeric base_rate_amount "before taxes"
        numeric weekend_rate_amount "nullable, Friday and Saturday nights"
        char rate_currency "CAD"
        boolean is_active
    }
    ROOM {
        uuid id PK "US-02"
        uuid room_type_id FK
        varchar state "UNAVAILABLE and MAINTENANCE not sellable"
        boolean is_active
    }
    ROOM_INVENTORY {
        uuid id PK "US-06"
        uuid room_type_id FK
        date stay_date "property local date"
        int reserved_count
        int version "optimistic lock"
    }
    PROPERTY {
        uuid id PK "US-02"
        varchar timezone
    }
```

---

## 3. Event Flow

### 3.1 Searching — Scenarios 1, 2, 4, 5 and 6

```mermaid
sequenceDiagram
    autonumber
    actor Guest
    participant View as AvailabilityView<br/>GET /api/v1/properties/{id}/availability
    participant UC as SearchAvailabilityUseCase
    participant Clock
    participant RM as AvailabilityReadModel
    participant Rates as NightlyRatePolicy
    participant Tax as TaxEngine

    Guest->>View: check-in, check-out, guests, language
    View->>UC: execute(query)
    UC->>Clock: today(property timezone)
    alt stay longer than 5 nights or outside the booking window
        UC-->>View: InvalidStay
        View-->>Guest: 422 the maximum stay is 5 nights
    else valid stay
        UC->>RM: available_room_types(property, nights, guests)
        Note over RM: active room types with max guests at least the request<br/>and a sellable room left on every night
        alt no room type
            UC-->>View: empty list
            View-->>Guest: 200 no rooms available for those dates
        else room types found
            loop each room type and night
                UC->>Rates: price(rate, night)
                UC->>Tax: taxes_for_night(property, night, rate)
            end
            UC-->>View: offers with nightly prices, taxes and total in CAD
            View-->>Guest: 200 OK, results in the selected language
        end
    end
```

### 3.2 Domain events

None. The search is read-only.
