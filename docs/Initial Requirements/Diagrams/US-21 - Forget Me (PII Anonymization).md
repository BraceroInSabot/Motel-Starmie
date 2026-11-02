# US-21 — Forget Me (PII Anonymization): Diagrams

> Sources: `US-21-forget-me-pii-anonymization.md`, `US-20-guest-profile-with-pipeda-consent.md`, `docs/Business Modeling/Business Modeling.md` (Section 4 "Strict Security & PIPEDA"), `CLAUDE.md`.
> Elements tagged **PENDING** depend on business rules not defined yet. They are placeholders in the design, not decisions.

---

## 1. Class Diagram (Clean Architecture)

```mermaid
classDiagram
    direction LR

    namespace Domain {
        class GuestProfile {
            <<Entity / Aggregate Root · US-20>>
            -PersonalInformation | None personal_information
            -AnonymousDemographics | None demographics
            -datetime | None anonymized_at_utc
            +anonymize(demographics: AnonymousDemographics, at_utc: datetime) None
            +is_anonymized() bool
        }
        class AnonymousDemographics {
            <<Value Object · fields PENDING>>
        }
        class ForgetMeEligibilityPolicy {
            <<Domain Service · restrictions PENDING>>
            +ensure_eligible(profile: GuestProfile, open_stays: list~ReservationSummary~) None
        }
        class ErasureRequest {
            <<Entity · no PII>>
            -ErasureRequestId id
            -GuestProfileId guest_profile_id
            -StaffMemberId executed_by
            -datetime executed_at_utc
        }
        class GuestProfileAnonymized {
            <<Domain Event · no PII>>
            +GuestProfileId guest_profile_id
            +datetime occurred_at_utc
        }
        class AlreadyAnonymizedError {
            <<Domain Exception>>
        }
        class ForgetMeNotAllowedError {
            <<Domain Exception · PENDING rules>>
        }
    }

    namespace Application {
        class ForgetGuestUseCase {
            <<Use Case>>
            +execute(command: ForgetGuestCommand) None
        }
        class ForgetGuestCommand {
            <<DTO>>
            +UUID guest_profile_id
            +UUID staff_member_id
        }
        class ScrubIdVerificationOnAnonymized {
            <<Event Handler · US-12>>
            +handle(event: GuestProfileAnonymized) None
        }
        class ScrubViolationReportsOnAnonymized {
            <<Event Handler · US-16, if stored>>
            +handle(event: GuestProfileAnonymized) None
        }
        class GuestProfileRepository {
            <<Port · US-20>>
            +get_by_id(guest_profile_id) GuestProfile
            +save(profile) None
        }
        class ReservationQuery {
            <<Port>>
            +open_stays_for(guest_profile_id) list~ReservationSummary~
        }
        class ErasureRequestRepository {
            <<Port>>
            +add(request: ErasureRequest) None
        }
        class DemographicsExtractor {
            <<Port · PENDING fields>>
            +extract(profile: GuestProfile) AnonymousDemographics
        }
        class AuthorizeStaffActionUseCase {
            <<Use Case · US-01>>
            +execute(staff_member_id, permission) None
        }
        class UnitOfWork {
            <<Port>>
            +commit() None
        }
        class EventPublisher {
            <<Port>>
            +publish(event: DomainEvent) None
        }
    }

    namespace Interface {
        class GuestErasureView {
            <<REST Controller>>
            +post(request, guest_profile_id) Response
        }
    }

    namespace FrontEnd {
        class GuestProfilePage {
            <<React Component · MantineUI>>
            +onForgetMe() void
        }
        class ConfirmErasureModal {
            <<React Component>>
            +confirm() void
        }
    }

    GuestProfile *-- AnonymousDemographics
    GuestProfile ..> AlreadyAnonymizedError : raises
    GuestProfile ..> GuestProfileAnonymized : records
    ForgetMeEligibilityPolicy ..> ForgetMeNotAllowedError : raises

    ForgetGuestUseCase ..> ForgetGuestCommand
    ForgetGuestUseCase --> AuthorizeStaffActionUseCase : GUEST_DATA_ERASURE
    ForgetGuestUseCase --> GuestProfileRepository
    ForgetGuestUseCase --> ReservationQuery
    ForgetGuestUseCase --> ForgetMeEligibilityPolicy
    ForgetGuestUseCase --> DemographicsExtractor
    ForgetGuestUseCase --> ErasureRequestRepository
    ForgetGuestUseCase --> UnitOfWork
    ForgetGuestUseCase --> EventPublisher
    ScrubIdVerificationOnAnonymized ..> GuestProfileAnonymized : handles
    ScrubViolationReportsOnAnonymized ..> GuestProfileAnonymized : handles

    GuestErasureView --> ForgetGuestUseCase
    GuestProfilePage --> ConfirmErasureModal
    ConfirmErasureModal ..> GuestErasureView : POST /api/v1/guest-profiles/{id}/erasure
```

### Design notes
- **`GuestProfile.anonymize()` (Scenario 1):**
  - removes `PersonalInformation` entirely (columns set to `NULL`, not overwritten with fake data);
  - keeps only `AnonymousDemographics` and sets `anonymized_at_utc`;
  - is irreversible, and a second call raises `AlreadyAnonymizedError`.
- **Financial records stay intact (Scenario 2):**
  - reservations, folios, ledger lines and invoices reference the guest only by `guest_profile_id`, which survives anonymization;
  - totals, taxes and the audit trail are therefore unchanged, and the records are now attached to anonymous demographic data.
- **PII copies elsewhere are scrubbed by event handlers.** `GuestProfileAnonymized` notifies modules that may hold guest PII, such as ID verification data (US-12, if stored) and violation reports (US-16, if stored), each in its own handler. The profile module does not need to know about them (Open/Closed principle).
- **`ErasureRequest`** records that an erasure happened, who executed it and when, without any PII. This is evidence of compliance.
- **Confirmation:** the UI asks for an explicit confirmation (`ConfirmErasureModal`) because the action cannot be undone.
- **PENDING:**
  - which roles can execute "Forget Me" (`GUEST_DATA_ERASURE` permission, assignment PENDING);
  - which demographic data is kept (`DemographicsExtractor`);
  - restrictions such as In-House guests or open balances (`ForgetMeEligibilityPolicy`);
  - whether names on already-issued invoices (US-17) must be kept for tax retention or removed, which needs legal review.

---

## 2. ER Diagram (PostgreSQL persistence)

```mermaid
erDiagram
    GUEST_PROFILE ||--o{ RESERVATION : "made"
    GUEST_PROFILE ||--o{ ERASURE_REQUEST : "is erased by"
    STAFF_MEMBER ||--o{ ERASURE_REQUEST : "executes"
    RESERVATION ||--|| FOLIO : "keeps"

    GUEST_PROFILE {
        uuid id PK "kept: financial records point here"
        bytea full_name_enc "NULL after anonymization"
        bytea email_enc "NULL after anonymization"
        varchar email_hash "NULL after anonymization"
        bytea phone_enc "NULL after anonymization"
        varchar demographic_fields "PENDING: which anonymous fields are kept"
        timestamptz anonymized_at "UTC"
    }
    ERASURE_REQUEST {
        uuid id PK
        uuid guest_profile_id FK
        uuid executed_by_staff_id FK
        timestamptz executed_at "UTC"
    }
    RESERVATION {
        uuid id PK "unchanged"
        uuid guest_profile_id FK
    }
    FOLIO {
        uuid id PK "unchanged"
        uuid reservation_id FK
    }
    STAFF_MEMBER {
        uuid id PK "partial: US-01"
    }
```

### Design notes
- **Consistency check:** `CHECK (anonymized_at IS NULL OR (full_name_enc IS NULL AND email_enc IS NULL AND email_hash IS NULL AND phone_enc IS NULL))` makes the database guarantee an anonymized profile holds no PII.
- **`ERASURE_REQUEST` contains no PII,** only references and timestamps.
- **Backups:** encrypted backups age out according to the retention policy. The backup retention period itself is PENDING.

---

## 3. Event Flow

### 3.1 Forget Me — Scenario 1

```mermaid
sequenceDiagram
    autonumber
    actor Staff as Authorized staff member
    participant Page as GuestProfilePage
    participant View as GuestErasureView<br/>POST /api/v1/guest-profiles/{id}/erasure
    participant UC as ForgetGuestUseCase
    participant Auth as AuthorizeStaffActionUseCase (US-01)
    participant Pol as ForgetMeEligibilityPolicy
    participant Repo as GuestProfileRepository
    participant Bus as EventPublisher
    participant H as Scrub handlers (US-12, US-16)

    Staff->>Page: Click "Forget Me"
    Page->>Staff: Confirm irreversible erasure
    Staff->>Page: Confirm
    Page->>View: POST erasure
    View->>UC: execute(command)
    UC->>Auth: execute(staff_id, GUEST_DATA_ERASURE)
    alt Not authorized (roles PENDING)
        Auth-->>UC: raise PermissionDeniedError
        View-->>Staff: 403 Forbidden
    else Authorized
        UC->>Repo: get_by_id(guest_profile_id)
        Repo-->>UC: GuestProfile
        UC->>Pol: ensure_eligible(profile, open stays)
        alt Restricted (rules PENDING)
            Pol-->>UC: raise ForgetMeNotAllowedError
            View-->>Staff: 409 Conflict
        else Eligible
            UC->>UC: profile.anonymize(demographics, now)
            UC->>Repo: save(profile), PII columns set to NULL
            UC->>UC: add ErasureRequest
            UC->>Bus: publish(GuestProfileAnonymized)
            Bus->>H: scrub PII copies in other modules (same transaction)
            UC->>UC: commit
            View-->>Staff: 204 No Content, profile anonymized
        end
    end
```

### 3.2 Financial records after anonymization — Scenario 2

```mermaid
sequenceDiagram
    autonumber
    actor GM as General Manager
    participant Reports as Folio / Reports (US-15, US-22)
    participant DB as PostgreSQL

    GM->>Reports: Open a past stay of the anonymized guest
    Reports->>DB: reservation, folio, ledger lines by guest_profile_id
    DB-->>Reports: amounts, taxes, dates intact, guest PII NULL
    Reports-->>GM: Financial record shown with "Anonymized guest" and demographic data only
```

### 3.3 Domain events

| Event | Emitted by | When | Payload | Consumers |
|---|---|---|---|---|
| `GuestProfileAnonymized` | `GuestProfile` (via `ForgetGuestUseCase`) | "Forget Me" executed | `guest_profile_id`, `occurred_at_utc` (no PII) | `ScrubIdVerificationOnAnonymized`, `ScrubViolationReportsOnAnonymized` (same transaction) |
