# US-12 — Check-in with Age Verification: Diagrams

> Sources: `US-12-check-in-with-age-verification.md`, `US-01-staff-authentication-and-role-based-access.md`, `docs/Business Modeling/Business Modeling.md` (Phase 2, Section 4), `CLAUDE.md`.
> Elements tagged **PENDING** depend on business rules not defined yet. They are placeholders in the design, not decisions.
> Data is scoped per **Property** (Business Modeling, Section 5) even where the story text does not mention it.

---

## 1. Class Diagram (Clean Architecture)

```mermaid
classDiagram
    direction LR

    namespace Domain {
        class IdVerification {
            <<Entity / Aggregate Root>>
            -IdVerificationId id
            -ReservationId reservation_id
            -IdVerificationResult result
            -StaffMemberId verified_by
            -datetime verified_at_utc
            -AgeOverride | None override
            +verify(reservation_id, date_of_birth, on_date, by)$ IdVerification
            +apply_override(override: AgeOverride) None
            +allows_check_in() bool
        }
        class IdVerificationResult {
            <<Enumeration>>
            ELIGIBLE
            UNDERAGE
        }
        class AgePolicy {
            <<Domain Service>>
            +MINIMUM_AGE = 21
            +age_on(date_of_birth: date, on_date: date) int
            +evaluate(date_of_birth: date, on_date: date) IdVerificationResult
        }
        class AgeOverride {
            <<Value Object>>
            +StaffMemberId approved_by
            +datetime approved_at_utc
            +str | None justification
        }
        class CheckInWindowPolicy {
            <<Domain Service>>
            +CHECK_IN_FROM = 16:00 local
            +ensure_check_in_allowed(property: Property, at_utc: datetime) None
        }
        class GuestIdVerified {
            <<Domain Event>>
            +ReservationId reservation_id
            +IdVerificationResult result
            +datetime occurred_at_utc
        }
        class AgePolicyOverridden {
            <<Domain Event>>
            +ReservationId reservation_id
            +StaffMemberId approved_by
            +datetime occurred_at_utc
        }
        class UnderageGuestError {
            <<Domain Exception>>
        }
        class CheckInTooEarlyError {
            <<Domain Exception>>
        }
        class OverrideNotAllowedError {
            <<Domain Exception>>
        }
    }

    namespace Application {
        class VerifyGuestIdUseCase {
            <<Use Case>>
            +execute(command: VerifyGuestIdCommand) IdVerificationView
        }
        class OverrideAgePolicyUseCase {
            <<Use Case>>
            +execute(command: OverrideAgePolicyCommand) IdVerificationView
        }
        class VerifyGuestIdCommand {
            <<DTO>>
            +UUID reservation_id
            +date date_of_birth
            +UUID staff_member_id
        }
        class OverrideAgePolicyCommand {
            <<DTO>>
            +UUID reservation_id
            +UUID manager_staff_member_id
            +str | None justification
        }
        class IdVerificationRepository {
            <<Port>>
            +add(verification: IdVerification) None
            +get_by_reservation(reservation_id: ReservationId) IdVerification
            +save(verification: IdVerification) None
        }
        class ReservationRepository {
            <<Port · US-06>>
            +get_by_id(reservation_id: ReservationId) Reservation
        }
        class PropertyRepository {
            <<Port · Property Registry diagram>>
            +get_by_id(property_id: PropertyId) Property
        }
        class AuthorizeStaffActionUseCase {
            <<Use Case · US-01>>
            +execute(staff_member_id, permission) None
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

    namespace Interface {
        class IdVerificationView {
            <<REST Controller>>
            +post(request, reservation_id) Response
        }
        class AgeOverrideView {
            <<REST Controller>>
            +post(request, reservation_id) Response
        }
    }

    IdVerification --> IdVerificationResult
    IdVerification *-- AgeOverride
    IdVerification ..> AgePolicy : uses
    IdVerification ..> GuestIdVerified : records
    IdVerification ..> AgePolicyOverridden : records
    AgePolicy ..> UnderageGuestError : signals
    CheckInWindowPolicy ..> CheckInTooEarlyError : raises

    VerifyGuestIdUseCase ..> VerifyGuestIdCommand
    VerifyGuestIdUseCase --> ReservationRepository
    VerifyGuestIdUseCase --> PropertyRepository
    VerifyGuestIdUseCase --> CheckInWindowPolicy
    VerifyGuestIdUseCase --> IdVerificationRepository
    VerifyGuestIdUseCase --> Clock
    VerifyGuestIdUseCase --> EventPublisher
    OverrideAgePolicyUseCase ..> OverrideAgePolicyCommand
    OverrideAgePolicyUseCase --> AuthorizeStaffActionUseCase : AGE_POLICY_OVERRIDE
    OverrideAgePolicyUseCase --> IdVerificationRepository
    OverrideAgePolicyUseCase --> EventPublisher
    OverrideAgePolicyUseCase ..> OverrideNotAllowedError : raises

    IdVerificationView --> VerifyGuestIdUseCase
    AgeOverrideView --> OverrideAgePolicyUseCase
```

### Design notes
- **`AgePolicy`** calculates the age from the date of birth on the government ID, against the **property's local date** of check-in (`MINIMUM_AGE = 21`). Birthdays on the check-in day count as already reached.
- **Override (Scenario 3):**
  - `OverrideAgePolicyUseCase` checks the `AGE_POLICY_OVERRIDE` permission (management only, US-01) for the **manager** who approves, not for the agent at the desk;
  - how the manager authenticates for the override is PENDING;
  - whether a justification and an audit record are required is PENDING (`justification` is optional).
- **`allows_check_in()`** is true for `ELIGIBLE`, or for `UNDERAGE` with an override. US-13 asks this before completing the check-in.
- **Check-in window:** `CheckInWindowPolicy` enforces "check-in starts at 4:00 PM" in the property's timezone. Early check-in handling is PENDING; until it is defined, early attempts are rejected (`CheckInTooEarlyError`).
- **Data minimisation (PIPEDA):**
  - the date of birth is used to compute the result;
  - only the result is persisted by default;
  - which ID data may be stored is PENDING (see the ER notes).

---

## 2. ER Diagram (PostgreSQL persistence)

```mermaid
erDiagram
    RESERVATION ||--o| ID_VERIFICATION : "is verified by"
    STAFF_MEMBER ||--o{ ID_VERIFICATION : "verifies"
    ID_VERIFICATION ||--o| AGE_POLICY_OVERRIDE : "may be overridden by"
    STAFF_MEMBER ||--o{ AGE_POLICY_OVERRIDE : "approves"

    ID_VERIFICATION {
        uuid id PK
        uuid reservation_id FK "UNIQUE"
        varchar result "ELIGIBLE, UNDERAGE"
        uuid verified_by_staff_id FK
        timestamptz verified_at "UTC"
        date date_of_birth "PENDING: stored only if allowed (PIPEDA)"
    }
    AGE_POLICY_OVERRIDE {
        uuid id PK
        uuid id_verification_id FK "UNIQUE"
        uuid approved_by_staff_id FK "must hold AGE_POLICY_OVERRIDE"
        timestamptz approved_at "UTC"
        text justification "PENDING: required or optional"
    }
    RESERVATION {
        uuid id PK "partial: US-06"
    }
    STAFF_MEMBER {
        uuid id PK "partial: US-01"
    }
```

### Design notes
- **Minimal storage by default:** `ID_VERIFICATION` stores who verified, when and the result. Columns such as `date_of_birth`, ID type or ID number are added only if PIPEDA review allows them (PENDING).
- **Erasure:** any stored ID data is scrubbed by "Forget Me" (US-21).
- **One record per reservation:** `UNIQUE (reservation_id)` keeps one verification per reservation. A re-verification updates that record.

---

## 3. Event Flow

### 3.1 Verifying the ID — Scenarios 1 and 2

```mermaid
sequenceDiagram
    autonumber
    actor Agent as Front Desk Agent
    participant View as IdVerificationView<br/>POST /api/v1/reservations/{id}/id-verification
    participant UC as VerifyGuestIdUseCase
    participant Win as CheckInWindowPolicy
    participant Age as AgePolicy
    participant Repo as IdVerificationRepository
    participant Bus as EventPublisher

    Agent->>View: POST {date_of_birth} after checking the government ID
    View->>UC: execute(command)
    UC->>Win: ensure_check_in_allowed(property, now_utc)
    alt Before 4:00 PM local
        Win-->>UC: raise CheckInTooEarlyError
        UC-->>View: error
        View-->>Agent: 409 Conflict (early check-in handling PENDING)
    else From 4:00 PM local
        UC->>Age: evaluate(date_of_birth, local check-in date)
        alt Age 21 or older (Scenario 1)
            Age-->>UC: ELIGIBLE
            UC->>Repo: add(IdVerification ELIGIBLE)
            UC->>Bus: publish(GuestIdVerified)
            UC-->>View: result ELIGIBLE
            View-->>Agent: 200 OK, check-in may proceed (deposit, US-13)
        else Under 21 (Scenario 2)
            Age-->>UC: UNDERAGE
            UC->>Repo: add(IdVerification UNDERAGE)
            UC->>Bus: publish(GuestIdVerified)
            UC-->>View: result UNDERAGE
            View-->>Agent: 200 OK, check-in blocked, management override available
        end
    end
```

### 3.2 Management override — Scenario 3

```mermaid
sequenceDiagram
    autonumber
    actor Manager as General Manager
    participant View as AgeOverrideView<br/>POST /api/v1/reservations/{id}/age-override
    participant UC as OverrideAgePolicyUseCase
    participant Auth as AuthorizeStaffActionUseCase (US-01)
    participant Repo as IdVerificationRepository
    participant Bus as EventPublisher

    Manager->>View: POST override (justification PENDING)
    View->>UC: execute(command)
    UC->>Auth: execute(manager_id, AGE_POLICY_OVERRIDE)
    alt Not management
        Auth-->>UC: raise PermissionDeniedError
        UC-->>View: error
        View-->>Manager: 403 Forbidden
    else Management
        UC->>Repo: get_by_reservation(reservation_id)
        Repo-->>UC: IdVerification (UNDERAGE)
        UC->>UC: apply_override(AgeOverride)
        UC->>Repo: save(verification)
        UC->>Bus: publish(AgePolicyOverridden)
        UC-->>View: allows_check_in = true
        View-->>Manager: 200 OK, check-in may proceed
    end
    Note over Manager,View: How the manager authenticates at the desk for the override is PENDING
```

### 3.3 Domain events

| Event | Emitted by | When | Payload | Consumers |
|---|---|---|---|---|
| `GuestIdVerified` | `VerifyGuestIdUseCase` | ID checked | `reservation_id`, `result`, `occurred_at_utc` | Front desk dashboard flag (US-10, read side) |
| `AgePolicyOverridden` | `OverrideAgePolicyUseCase` | Management override applied | `reservation_id`, `approved_by`, `occurred_at_utc` | PENDING (audit, if required) |
