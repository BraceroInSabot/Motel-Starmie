# US-05 — Policy Acceptance Before Payment: Diagrams

> Source: `US-05-policy-acceptance-before-payment.md`. Related: US-06 (direct booking), US-09 (walk-in), US-07 (OTA, no acceptance), US-11 (fees shown on the page).

## Business rules reflected

| Rule (US-05) | Where it appears |
|---|---|
| T&C per property, EN and FR | `TermsVersion.property_id`, `LocalizedText` content |
| A default T&C per property ships with the system; the GM edits it | Seed data, `PublishTermsVersionUseCase` |
| Must include at least: 21+, no pets, no smoking/cannabis, check-in/out times, deposit | Content of the seeded default (GM text) |
| The page shows the property's current cancellation and no-show fees, or "no fee" (US-11) | `TermsPage.fees` built from `PropertyPolicy` |
| Every edit creates a new version; the guest must accept the latest version | Append-only `TERMS_VERSION`, `AcceptTermsUseCase` version check |
| Acceptance before payment information is taken | `TermsAcceptanceToken` required by US-06 and US-09 |
| Displayed in EN or FR, as the guest chooses | `language` on display and on the evidence |
| Evidence: timestamp, version, language, channel (website or front desk); no IP address | `TERMS_ACCEPTANCE` columns |
| Walk-ins: the agent records acceptance for the guest; the agent is stored | `recorded_by_staff_id` |
| OTA bookings record no acceptance | US-07 flow skips this story |

---

## 1. Class Diagram (Clean Architecture)

```mermaid
classDiagram
    direction LR

    namespace Domain {
        class TermsVersion {
            <<Aggregate Root · append-only>>
            +TermsVersionId id
            +PropertyId property_id
            +int number
            +LocalizedText content
            +datetime published_at
            +StaffId published_by
        }
        class AcceptanceChannel {
            <<Enumeration>>
            WEBSITE
            FRONT_DESK
        }
        class TermsAcceptance {
            <<Entity>>
            +TermsAcceptanceId id
            +TermsVersionId version_id
            +Language language
            +AcceptanceChannel channel
            +StaffId recorded_by
            +datetime accepted_at
        }
        class FeeDisclosure {
            <<Value Object>>
            +Money cancellation_fee
            +int cancellation_window_hours
            +Money no_show_fee
        }
        class TermsRepository {
            <<Port>>
            +latest(property_id) TermsVersion
            +add(version) None
        }
        class AcceptanceRepository {
            <<Port>>
        }
    }

    namespace Application {
        class GetTermsPageUseCase {
            +execute(property_id, language) TermsPage
        }
        class TermsPage {
            <<DTO>>
            +int version_number
            +str text
            +FeeDisclosure fees
        }
        class AcceptTermsUseCase {
            +execute(property_id, version_id, language, channel, staff_id) TermsAcceptanceToken
        }
        class PublishTermsVersionUseCase {
            <<SETTINGS · GM>>
            +execute(property_id, content_en, content_fr) TermsVersion
        }
        class PropertyPolicyReader {
            <<Port · US-11>>
            +fees(property_id) FeeDisclosure
        }
        class Clock {
            <<Port>>
        }
    }

    namespace Infrastructure {
        class DjangoTermsRepository
        class DjangoAcceptanceRepository
    }

    namespace Interface {
        class TermsViews {
            <<REST>>
            GET /api/v1/properties/id/terms
            POST /api/v1/properties/id/terms/acceptances
        }
        class TermsSettingsView {
            <<REST · SETTINGS>>
            POST /api/v1/properties/id/terms
        }
    }

    TermsAcceptance --> TermsVersion
    TermsAcceptance --> AcceptanceChannel
    GetTermsPageUseCase --> TermsRepository
    GetTermsPageUseCase --> PropertyPolicyReader
    GetTermsPageUseCase ..> TermsPage
    TermsPage *-- FeeDisclosure
    AcceptTermsUseCase --> TermsRepository
    AcceptTermsUseCase --> AcceptanceRepository
    AcceptTermsUseCase --> Clock
    PublishTermsVersionUseCase --> TermsRepository
    DjangoTermsRepository ..|> TermsRepository
    DjangoAcceptanceRepository ..|> AcceptanceRepository
    TermsViews --> GetTermsPageUseCase
    TermsViews --> AcceptTermsUseCase
    TermsSettingsView --> PublishTermsVersionUseCase
```

### Design notes
- **Version check (Scenario 4):** `AcceptTermsUseCase` compares the `version_id` the guest saw with `latest(property_id)`. If the GM published a newer version in the meantime, it returns `TermsOutdated` with the new version, and the guest must accept it.
- **Acceptance token:** the use case returns a short-lived token that the booking (US-06) or walk-in (US-09) use case requires; without it the payment step is refused (Scenario 2). The acceptance row is linked to the reservation when the reservation is created.
- **Front desk:** when `channel = FRONT_DESK`, `recorded_by` is the logged-in agent. When `channel = WEBSITE`, it is null.
- **Fees:** the fee block is not part of the GM's text. It is rendered from the property settings at display time, so it always shows the current fees or "no fee".

---

## 2. ER Diagram

```mermaid
erDiagram
    PROPERTY ||--o{ TERMS_VERSION : "publishes"
    TERMS_VERSION ||--o{ TERMS_ACCEPTANCE : "accepted as"
    RESERVATION ||--o| TERMS_ACCEPTANCE : "evidence"
    STAFF_USER ||--o{ TERMS_ACCEPTANCE : "records at desk"

    TERMS_VERSION {
        uuid id PK
        uuid property_id FK
        int number "UK with property_id"
        text content_en
        text content_fr
        uuid published_by FK "null for the shipped default"
        timestamptz published_at
    }
    TERMS_ACCEPTANCE {
        uuid id PK
        uuid terms_version_id FK
        uuid reservation_id FK "set when the reservation is created"
        char language "EN or FR"
        varchar channel "WEBSITE or FRONT_DESK"
        uuid recorded_by_staff_id FK "FRONT_DESK only"
        timestamptz accepted_at
    }
    RESERVATION {
        uuid id PK "US-06"
    }
    STAFF_USER {
        uuid id PK "US-01"
    }
    PROPERTY {
        uuid id PK "US-02"
    }
```

### Design notes
- No IP address column, by rule.
- `CHECK (channel = 'WEBSITE' AND recorded_by_staff_id IS NULL OR channel = 'FRONT_DESK' AND recorded_by_staff_id IS NOT NULL)`.

---

## 3. Event Flow

### 3.1 Acceptance before payment — Scenarios 1 to 5

```mermaid
sequenceDiagram
    autonumber
    actor Guest
    participant Widget as Booking widget
    participant View as TermsViews
    participant Page as GetTermsPageUseCase
    participant Accept as AcceptTermsUseCase

    Guest->>Widget: continues to checkout in EN or FR
    Widget->>View: GET terms (property, language)
    View->>Page: execute(property_id, language)
    Page-->>Widget: latest version text + current cancellation and no-show fees
    Widget-->>Guest: T&C with 21+, no pets, no smoking/cannabis, times, deposit, fees
    alt guest does not accept
        Widget-->>Guest: payment step stays locked
    else guest accepts version N
        Widget->>View: POST acceptance (version N, language, WEBSITE)
        View->>Accept: execute(...)
        alt a newer version N+1 exists
            Accept-->>Widget: 409 TermsOutdated with version N+1
            Widget-->>Guest: shows version N+1 and asks for acceptance
        else version N is the latest
            Accept-->>Widget: 201 acceptance token
            Widget-->>Guest: payment step unlocked (US-06)
        end
    end
```

### 3.2 Domain events

| Event | Raised when | Consumers |
|---|---|---|
| `TermsVersionPublished` | GM saves an edit | Audit log |
| `TermsAccepted` | Guest or agent records an acceptance | Linked to the reservation at creation (US-06, US-09) |
