# US-05 — Policy Acceptance Before Payment: Diagrams

> Sources: `US-05-policy-acceptance-before-payment.md`, `docs/Business Modeling/Business Modeling.md` (Phase 1, Sections 5 and 7), `CLAUDE.md`.
> Elements tagged **PENDING** depend on business rules not defined yet. They are placeholders in the design, not decisions.
> Data is scoped per **Property** (Business Modeling, Section 5) even where the story text does not mention it.

---

## 1. Class Diagram (Clean Architecture + Front-end)

```mermaid
classDiagram
    direction LR

    namespace Domain {
        class TermsAndConditions {
            <<Entity / Aggregate Root>>
            -TermsId id
            -PropertyId property_id
            -str version
            -set~PolicyItem~ policy_items
            -dict~Language, TermsText~ texts
            +text_for(language: Language) TermsText
        }
        class PolicyItem {
            <<Enumeration>>
            AGE_21_PLUS
            NO_PETS
            NO_SMOKING_CANNABIS
        }
        class TermsText {
            <<Value Object>>
            +Language language
            +str body
        }
        class PolicyAcceptance {
            <<Value Object>>
            +TermsId terms_id
            +str terms_version
            +bool accepted
            +datetime accepted_at_utc
            +ensure_accepted() None
        }
        class Language {
            <<Enumeration · Staff Interface Language diagram>>
            EN
            FR
        }
        class TermsNotAcceptedError {
            <<Domain Exception>>
        }
        class TermsVersionMismatchError {
            <<Domain Exception>>
        }
    }

    namespace Application {
        class GetApplicableTermsUseCase {
            <<Use Case>>
            +execute(property_id: PropertyId, language: Language) TermsView
        }
        class TermsView {
            <<DTO>>
            +UUID terms_id
            +str version
            +list~str~ policy_items
            +str language
            +str body
        }
        class TermsRepository {
            <<Port>>
            +get_active_for_property(property_id: PropertyId) TermsAndConditions
        }
        class CreateReservationUseCase {
            <<Use Case · US-06>>
            +execute(command: CreateReservationCommand) ReservationConfirmation
        }
        class TermsAcceptanceRepository {
            <<Port · PENDING evidence>>
            +record(reservation_id: ReservationId, acceptance: PolicyAcceptance) None
        }
    }

    namespace Infrastructure {
        class DjangoTermsRepository {
            <<Adapter>>
        }
        class DjangoTermsAcceptanceRepository {
            <<Adapter · PENDING evidence>>
        }
    }

    namespace Interface {
        class PropertyTermsView {
            <<REST Controller>>
            +get(request, property_id) Response
        }
    }

    namespace FrontEnd {
        class BookingWizard {
            <<React Component>>
            +steps: SelectRoom, Policies, Payment
        }
        class PolicyAcceptanceStep {
            <<React Component · MantineUI>>
            +accepted: boolean
            +onAccept() void
        }
        class PaymentStep {
            <<React Component>>
            +enabled: boolean
        }
    }

    TermsAndConditions *-- TermsText
    TermsAndConditions --> PolicyItem
    TermsText --> Language
    PolicyAcceptance ..> TermsNotAcceptedError : raises
    PolicyAcceptance ..> TermsVersionMismatchError : raises

    GetApplicableTermsUseCase --> TermsRepository
    GetApplicableTermsUseCase ..> TermsView
    CreateReservationUseCase ..> PolicyAcceptance : validates
    CreateReservationUseCase --> TermsRepository
    CreateReservationUseCase --> TermsAcceptanceRepository

    DjangoTermsRepository ..|> TermsRepository
    DjangoTermsAcceptanceRepository ..|> TermsAcceptanceRepository
    PropertyTermsView --> GetApplicableTermsUseCase

    BookingWizard --> PolicyAcceptanceStep
    BookingWizard --> PaymentStep
    PolicyAcceptanceStep ..> PropertyTermsView : GET /api/v1/properties/{id}/terms
    PolicyAcceptanceStep ..> PaymentStep : enables only when accepted
```

### Design notes
- **The three known policies are an enumeration** (`AGE_21_PLUS`, `NO_PETS`, `NO_SMOKING_CANNABIS`). The full Terms & Conditions text, including the cancellation policy, is PENDING and lives in `TermsText.body`, one per language (EN/FR).
- **Acceptance is enforced on both sides:**
  - **Front end:** `PaymentStep` stays disabled until `PolicyAcceptanceStep` is accepted, so no card field is shown before acceptance.
  - **Back end:** `CreateReservationUseCase` (US-06) rejects a request without a valid `PolicyAcceptance` (`TermsNotAcceptedError`), so the rule holds even if the front end is bypassed.
- **`TermsVersionMismatchError`** prevents accepting an outdated text if the terms changed while the guest was booking.
- **Evidence (PENDING):**
  - `TermsAcceptanceRepository` and its adapter exist only if acceptance must be stored as evidence (timestamp and version);
  - otherwise acceptance is validated and not persisted.
- **Per property:** terms are looked up per property. Whether both properties share identical policies is PENDING (Business Modeling, Section 5); one active terms record per property supports both answers.

---

## 2. ER Diagram (PostgreSQL persistence)

```mermaid
erDiagram
    PROPERTY ||--o{ TERMS_AND_CONDITIONS : "publishes"
    TERMS_AND_CONDITIONS ||--|{ TERMS_TEXT : "is written in"
    TERMS_AND_CONDITIONS ||--|{ TERMS_POLICY_ITEM : "includes"
    TERMS_AND_CONDITIONS ||--o{ RESERVATION_TERMS_ACCEPTANCE : "is accepted in"
    RESERVATION ||--o| RESERVATION_TERMS_ACCEPTANCE : "records"

    PROPERTY {
        uuid id PK "partial: Property Registry diagram"
    }
    TERMS_AND_CONDITIONS {
        uuid id PK
        uuid property_id FK "NOT NULL"
        varchar version "UNIQUE (property_id, version)"
        boolean is_active "one active per property (partial unique index)"
        timestamptz published_at "UTC"
    }
    TERMS_TEXT {
        uuid terms_id PK, FK
        varchar language PK "CHECK IN ('en','fr')"
        text body "full text PENDING"
    }
    TERMS_POLICY_ITEM {
        uuid terms_id PK, FK
        varchar item_code PK "AGE_21_PLUS, NO_PETS, NO_SMOKING_CANNABIS"
    }
    RESERVATION {
        uuid id PK "partial: US-06"
    }
    RESERVATION_TERMS_ACCEPTANCE {
        uuid reservation_id PK, FK "PENDING: only if evidence is required"
        uuid terms_id FK
        varchar terms_version
        varchar language "language shown to the guest"
        timestamptz accepted_at "UTC"
    }
```

### Design notes
- **Both languages required:** `TERMS_TEXT` has a composite key `(terms_id, language)`, and publishing requires both `en` and `fr` rows, since only these two languages are supported.
- **One active version per property:** a partial unique index (`UNIQUE (property_id) WHERE is_active`) guarantees it.
- **`RESERVATION_TERMS_ACCEPTANCE` is PENDING.** It is created only if acceptance evidence is required.

---

## 3. Event Flow

### 3.1 Displaying and accepting the policies — Scenarios 1 and 3

```mermaid
sequenceDiagram
    autonumber
    actor Guest
    participant Wizard as BookingWizard
    participant Step as PolicyAcceptanceStep
    participant View as PropertyTermsView<br/>GET /api/v1/properties/{id}/terms
    participant UC as GetApplicableTermsUseCase
    participant Repo as TermsRepository
    participant Pay as PaymentStep

    Guest->>Wizard: Room type and dates selected, proceed to payment
    Wizard->>Step: Show policies step
    Step->>View: GET with Accept-Language: fr (or en)
    View->>UC: execute(property_id, FR)
    UC->>Repo: get_active_for_property(property_id)
    Repo-->>UC: TermsAndConditions
    UC->>UC: text_for(FR)
    UC-->>View: TermsView (version, policy items, body in FR)
    View-->>Step: 200 OK
    Step-->>Guest: Age 21+, No Pets, No Smoking/Cannabis and full terms, in French
    Guest->>Step: Tick "I accept"
    Step->>Pay: enable(terms_id, version)
    Pay-->>Guest: Card fields displayed (US-06)
```

### 3.2 Policies not accepted — Scenario 2

```mermaid
sequenceDiagram
    autonumber
    actor Guest
    participant Step as PolicyAcceptanceStep
    participant Pay as PaymentStep
    participant API as POST /api/v1/reservations (US-06)
    participant UC as CreateReservationUseCase

    Guest->>Step: Does not tick "I accept"
    Step-->>Pay: stays disabled
    Pay-->>Guest: Card fields not shown, cannot proceed

    Note over Guest,UC: Defence in depth, if the front end is bypassed
    Guest->>API: POST without accepted terms
    API->>UC: execute(command)
    UC->>UC: PolicyAcceptance.ensure_accepted()
    UC-->>API: raise TermsNotAcceptedError
    API-->>Guest: 422 Unprocessable Entity
```

### 3.3 Domain events

No domain event is emitted by this story. Acceptance travels inside the reservation request (US-06). If acceptance evidence is required (PENDING), it is stored in the same transaction as the reservation.
