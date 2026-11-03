# US-20 — Guest Profile with PIPEDA Consent: Diagrams

> Source: `US-20-guest-profile-with-pipeda-consent.md`. Related: US-06, US-07, US-09 (where profiles are created), US-21 (anonymization).

## Business rules reflected

| Rule (US-20) | Where it appears |
|---|---|
| Fields: full name, email, phone, preferred language, consent (yes/no, date and time, source) | `GuestProfile`, `PipedaConsent` |
| `PIPEDA_consent_flag` required on the profile | `GUEST_PROFILE.pipeda_consent_flag` |
| No consent → no registration; OTA consent via the OTA, source "OTA" | `GuestProfileService` guard; `ConsentSource.OTA` |
| Consent covers reservations and stays only; no marketing emails in V1 | No marketing port or flag |
| Returning guest matched by email (case-insensitive); name and phone updated | `email_hash` of the normalized email, `register_or_update()` |
| One profile shared by all properties | No `property_id` on the profile |
| Full name, email and phone encrypted | `*_enc` columns, `FieldEncryptor` port |
| Kept until "Forget Me"; no automatic deletion | No retention job; US-21 |
| Supports anonymization | Nullable PII columns (US-21) |
| FDA and GM view and edit; no guest self-edit | `GUEST_PROFILES` permission; no public endpoint |

---

## 1. Class Diagram (Clean Architecture)

```mermaid
classDiagram
    direction LR

    namespace Domain {
        class GuestProfile {
            <<Aggregate Root>>
            +GuestId id
            +str full_name
            +EmailAddress email
            +str phone
            +Language preferred_language
            +PipedaConsent consent
            +str stripe_customer_id
            +datetime anonymized_at
            +update_contact(name, phone) None
        }
        class PipedaConsent {
            <<Value Object>>
            +bool given
            +datetime given_at
            +ConsentSource source
        }
        class ConsentSource {
            <<Enumeration>>
            WEBSITE
            FRONT_DESK
            OTA
        }
        class GuestRepository {
            <<Port>>
            +by_email_hash(hash) GuestProfile
            +save(profile) None
        }
    }

    namespace Application {
        class GuestProfileService {
            <<Application Service>>
            +register_or_update(details, consent, source) GuestProfile
        }
        class UpdateGuestProfileUseCase {
            <<GUEST_PROFILES>>
        }
        class GetGuestProfileUseCase {
            <<GUEST_PROFILES>>
        }
        class FieldEncryptor {
            <<Port>>
            +encrypt(text) bytes
            +decrypt(data) str
        }
        class EmailHasher {
            <<Port>>
            +hash(normalized_email) str
        }
    }

    namespace Infrastructure {
        class FernetFieldEncryptor {
            <<key from environment>>
        }
        class HmacEmailHasher {
            <<keyed hash>>
        }
        class DjangoGuestRepository
    }

    namespace Interface {
        class GuestViews {
            <<REST · GUEST_PROFILES>>
            GET /api/v1/guests?q=
            GET /api/v1/guests/id
            PATCH /api/v1/guests/id
        }
    }

    GuestProfile *-- PipedaConsent
    PipedaConsent --> ConsentSource
    GuestProfileService --> GuestRepository
    GuestProfileService --> EmailHasher
    UpdateGuestProfileUseCase --> GuestRepository
    GetGuestProfileUseCase --> GuestRepository
    DjangoGuestRepository ..|> GuestRepository
    DjangoGuestRepository --> FieldEncryptor
    FernetFieldEncryptor ..|> FieldEncryptor
    HmacEmailHasher ..|> EmailHasher
    GuestViews --> GetGuestProfileUseCase
    GuestViews --> UpdateGuestProfileUseCase
```

### Design notes
- **Matching:** the email is trimmed and lower-cased, then hashed with a keyed hash (`email_hash`, unique). Encrypted columns cannot be searched, so the hash is the lookup key (Scenario 4).
- **`register_or_update()`:** refuses when consent is not given (Scenario 3), so the calling booking use case creates nothing; for an existing profile it updates the name and phone and keeps the original consent record; for OTA bookings the consent is recorded with source `OTA`.
- **Preferred language** is updated from the latest booking language.
- **Encryption** happens in the repository adapter, so the domain works with plain values and the database stores only ciphertext.

---

## 2. ER Diagram

```mermaid
erDiagram
    GUEST_PROFILE ||--o{ RESERVATION : "books"

    GUEST_PROFILE {
        uuid id PK
        bytea full_name_enc "nullable, US-21"
        bytea email_enc "nullable, US-21"
        varchar email_hash UK "nullable, US-21"
        bytea phone_enc "nullable, US-21"
        char preferred_language "EN or FR"
        boolean pipeda_consent_flag
        timestamptz consent_given_at
        varchar consent_source "WEBSITE, FRONT_DESK, OTA"
        varchar stripe_customer_id "US-06, deleted by US-21"
        timestamptz created_at
        timestamptz updated_at
        timestamptz anonymized_at "US-21"
    }
    RESERVATION {
        uuid id PK "US-06"
        uuid guest_id FK
        uuid property_id FK "profile shared by both properties"
    }
```

---

## 3. Event Flow

### 3.1 Registration during a booking — Scenarios 1 to 4

```mermaid
sequenceDiagram
    autonumber
    participant Booking as Booking use case (US-06, US-07, US-09)
    participant Svc as GuestProfileService
    participant Hash as EmailHasher
    participant Repo as GuestRepository

    Booking->>Svc: register_or_update(details, consent, source)
    alt consent not given
        Svc-->>Booking: ConsentRequired, nothing created
    else consent given
        Svc->>Hash: hash(normalized email)
        Svc->>Repo: by_email_hash(hash)
        alt returning guest
            Svc->>Repo: save(name and phone updated)
        else new guest
            Svc->>Repo: save(new profile, encrypted PII, consent, date and time, source)
        end
        Svc-->>Booking: profile, linked to the reservation
    end
```

### 3.2 Domain events

| Event | Raised when | Consumers |
|---|---|---|
| `GuestProfileCreated` | New profile | — |
| `GuestProfileUpdated` | Returning guest or staff edit | Audit log (no PII in details) |
