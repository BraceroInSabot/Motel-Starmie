# US-20 — Guest Profile with PIPEDA Consent: Diagrams

> Sources: `US-20-guest-profile-with-pipeda-consent.md`, `US-21-forget-me-pii-anonymization.md`, `docs/Business Modeling/Business Modeling.md` (Section 2 "GuestProfile", Section 4 "Strict Security & PIPEDA"), `CLAUDE.md`.
> Elements tagged **PENDING** depend on business rules not defined yet. They are placeholders in the design, not decisions.
> Whether guest profiles are shared across properties is PENDING (Business Modeling, Section 5); this design keeps profiles property-independent and links them through reservations.

---

## 1. Class Diagram (Clean Architecture)

```mermaid
classDiagram
    direction LR

    namespace Domain {
        class GuestProfile {
            <<Entity / Aggregate Root>>
            -GuestProfileId id
            -PersonalInformation | None personal_information
            -PipedaConsent consent
            -Language preferred_language
            -AnonymousDemographics | None demographics
            -datetime | None anonymized_at_utc
            +register(personal_information, consent, language)$ GuestProfile
            +update_personal_information(info: PersonalInformation) None
            +is_anonymized() bool
        }
        class PersonalInformation {
            <<Value Object · PII>>
            +str full_name
            +EmailAddress email
            +str | None phone
            %% mandatory fields PENDING
        }
        class EmailAddress {
            <<Value Object>>
            +str value
        }
        class PipedaConsent {
            <<Value Object>>
            +bool consent_flag
            +datetime recorded_at_utc
            +ConsentSource source
        }
        class ConsentSource {
            <<Enumeration>>
            BOOKING_WIDGET
            FRONT_DESK
            OTA
        }
        class AnonymousDemographics {
            <<Value Object · fields PENDING, US-21>>
        }
        class GuestProfileRegistered {
            <<Domain Event>>
            +GuestProfileId guest_profile_id
            +bool consent_flag
            +datetime occurred_at_utc
        }
        class MissingConsentDecisionError {
            <<Domain Exception>>
        }
        class GuestProfileAnonymizedError {
            <<Domain Exception>>
        }
    }

    namespace Application {
        class RegisterGuestProfileUseCase {
            <<Use Case>>
            +execute(command: RegisterGuestProfileCommand) GuestProfileId
        }
        class GetGuestProfileUseCase {
            <<Query Use Case>>
            +execute(guest_profile_id: GuestProfileId) GuestProfileView
        }
        class RegisterGuestProfileCommand {
            <<DTO>>
            +str full_name
            +str email
            +str | None phone
            +bool pipeda_consent
            +str consent_source
            +str preferred_language
        }
        class GuestProfileRepository {
            <<Port>>
            +add(profile: GuestProfile) None
            +get_by_id(guest_profile_id: GuestProfileId) GuestProfile
            +save(profile: GuestProfile) None
        }
        class BookingService {
            <<Application Service · US-06>>
            +book(request: BookingRequest) Reservation
        }
        class Clock {
            <<Port>>
            +now_utc() datetime
        }
        class EventPublisher {
            <<Port>>
            +publish(event: DomainEvent) None
        }
    }

    namespace Infrastructure {
        class DjangoGuestProfileRepository {
            <<Adapter · PII columns encrypted at rest>>
        }
    }

    namespace Interface {
        class GuestProfilesView {
            <<REST Controller>>
            +post(request) Response
        }
        class GuestProfileDetailView {
            <<REST Controller>>
            +get(request, guest_profile_id) Response
        }
    }

    GuestProfile *-- PersonalInformation
    GuestProfile *-- PipedaConsent
    GuestProfile *-- AnonymousDemographics
    PersonalInformation *-- EmailAddress
    PipedaConsent --> ConsentSource
    GuestProfile ..> GuestProfileRegistered : records
    GuestProfile ..> MissingConsentDecisionError : raises
    GuestProfile ..> GuestProfileAnonymizedError : raises

    RegisterGuestProfileUseCase ..> RegisterGuestProfileCommand
    RegisterGuestProfileUseCase --> GuestProfileRepository
    RegisterGuestProfileUseCase --> Clock
    RegisterGuestProfileUseCase --> EventPublisher
    GetGuestProfileUseCase --> GuestProfileRepository
    BookingService --> GuestProfileRepository : links reservation

    DjangoGuestProfileRepository ..|> GuestProfileRepository
    GuestProfilesView --> RegisterGuestProfileUseCase
    GuestProfileDetailView --> GetGuestProfileUseCase
```

### Design notes
- **PII is isolated in one value object:** all PII sits in `PersonalInformation`, kept apart from the rest of the profile. "Forget Me" (US-21) can then remove PII in one operation, and the rest of the system references guests only by `GuestProfileId`.
- **Consent is stored with its context (Scenario 1):**
  - `PipedaConsent` keeps the flag required by the business document, when it was recorded (UTC) and from which channel;
  - a profile cannot be registered without an explicit consent decision (`MissingConsentDecisionError`);
  - what the system does when consent is **not** given is PENDING.
- **Scenario 2:** reservations reference `guest_profile_id` (US-06). The profile is created or reused by `BookingService` when a booking is made.
- **Anonymized profiles are read-only:** after anonymization (US-21), updates raise `GuestProfileAnonymizedError`.
- **Encryption at rest (technical recommendation):** PII columns are encrypted at rest, e.g., PostgreSQL `pgcrypto` or application-level field encryption, so database backups do not expose PII in clear text.
- **PENDING:**
  - mandatory profile fields (only name and email are assumed);
  - matching a returning guest to an existing profile;
  - sharing profiles across properties.
- **Permission:** reading PII requires a `GUEST_DATA_ACCESS` permission (role-permission matrix, US-01).

---

## 2. ER Diagram (PostgreSQL persistence)

```mermaid
erDiagram
    GUEST_PROFILE ||--o{ RESERVATION : "makes"

    GUEST_PROFILE {
        uuid id PK
        bytea full_name_enc "PII, encrypted, nullable after anonymization"
        bytea email_enc "PII, encrypted, nullable after anonymization"
        varchar email_hash "for lookups without decrypting, nullable"
        bytea phone_enc "PII, encrypted, nullable"
        boolean pipeda_consent_flag "NOT NULL"
        varchar consent_source "BOOKING_WIDGET, FRONT_DESK, OTA"
        timestamptz consent_recorded_at "UTC"
        varchar preferred_language "CHECK IN ('en','fr')"
        timestamptz anonymized_at "UTC, nullable (US-21)"
        timestamptz created_at "UTC"
        timestamptz updated_at "UTC"
    }
    RESERVATION {
        uuid id PK "partial: US-06"
        uuid guest_profile_id FK "NOT NULL"
    }
```

### Design notes
- **Encrypted columns:** `*_enc` columns hold encrypted values. `email_hash` (a keyed hash) supports finding a returning guest without decrypting every row; matching rules are PENDING.
- **`pipeda_consent_flag NOT NULL`** makes the database itself reject a profile without a consent decision.
- **Anonymous demographic columns** are added once US-21 defines which ones are kept.
- **Field names are illustrative** until the mandatory profile fields are defined.

---

## 3. Event Flow

### 3.1 Registering a profile — Scenario 1

```mermaid
sequenceDiagram
    autonumber
    actor Agent as Front Desk Agent
    participant View as GuestProfilesView<br/>POST /api/v1/guest-profiles
    participant UC as RegisterGuestProfileUseCase
    participant Profile as GuestProfile
    participant Repo as GuestProfileRepository
    participant Bus as EventPublisher

    Agent->>View: POST {name, email, phone, pipeda_consent, language}
    View->>UC: execute(command)
    UC->>Profile: GuestProfile.register(info, consent, language)
    alt Consent decision missing
        Profile-->>UC: raise MissingConsentDecisionError
        UC-->>View: error
        View-->>Agent: 422 Unprocessable Entity
    else Consent given
        Profile-->>UC: GuestProfile (consent_flag = true, recorded_at)
        UC->>Repo: add(profile), PII encrypted by the adapter
        UC->>Bus: publish(GuestProfileRegistered)
        UC-->>View: guest_profile_id
        View-->>Agent: 201 Created
    else Consent refused
        Note over UC,Agent: PENDING: what the system does when consent is not given
    end
```

### 3.2 Linking the profile to a reservation — Scenario 2

```mermaid
sequenceDiagram
    autonumber
    participant Caller as Booking (US-06) / Walk-in (US-09) / OTA (US-07)
    participant Book as BookingService
    participant Profiles as GuestProfileRepository
    participant Res as ReservationRepository

    Caller->>Book: book(request with guest_profile_id or guest data)
    alt Existing profile
        Book->>Profiles: get_by_id(guest_profile_id)
        Profiles-->>Book: GuestProfile
    else New guest
        Book->>Profiles: add(GuestProfile.register(...))
    end
    Book->>Res: add(reservation with guest_profile_id)
    Note over Book,Res: The reservation stores only the reference, never a copy of the PII
```

### 3.3 Domain events

| Event | Emitted by | When | Payload | Consumers |
|---|---|---|---|---|
| `GuestProfileRegistered` | `RegisterGuestProfileUseCase` / `BookingService` | Profile created | `guest_profile_id`, `consent_flag`, `occurred_at_utc` (no PII) | none |
