# US-14 — Night Audit (End of Day): Diagrams

> Sources: `US-14-night-audit-end-of-day.md`, `US-04-localized-tax-calculation.md`, `US-15-folio-ledger.md`, `docs/Business Modeling/Business Modeling.md` (Personas, Phase 3, Sections 4 and 5), `docs/Tech Stack/Tools.md` (cron), `CLAUDE.md`.
> Elements tagged **PENDING** depend on business rules not defined yet. They are placeholders in the design, not decisions.
> Data is scoped per **Property** (Business Modeling, Section 5): the Night Audit runs separately for each property.

---

## 1. Class Diagram (Clean Architecture)

```mermaid
classDiagram
    direction LR

    namespace Domain {
        class NightAuditRun {
            <<Entity / Aggregate Root>>
            -NightAuditRunId id
            -PropertyId property_id
            -date business_date
            -NightAuditStatus status
            -datetime started_at_utc
            -datetime | None finished_at_utc
            -int posted_reservations
            +start(property_id, business_date, at_utc)$ NightAuditRun
            +complete(posted: int, at_utc: datetime) None
            +fail(reason: str, at_utc: datetime) None
        }
        class NightAuditStatus {
            <<Enumeration>>
            RUNNING
            COMPLETED
            FAILED
        }
        class NightAuditSchedule {
            <<Domain Service>>
            +is_due(property: Property, cutoff_local: time, now_utc: datetime) bool
            +business_date_for(property: Property, now_utc: datetime) date
        }
        class NightAuditCompleted {
            <<Domain Event>>
            +NightAuditRunId run_id
            +PropertyId property_id
            +date business_date
            +int posted_reservations
            +datetime occurred_at_utc
        }
        class NightAuditFailed {
            <<Domain Event>>
            +NightAuditRunId run_id
            +str reason
            +datetime occurred_at_utc
        }
        class NightAuditAlreadyRunError {
            <<Domain Exception>>
        }
    }

    namespace Application {
        class NightAuditSchedulerJob {
            <<Scheduled Job · cron>>
            +tick() None
        }
        class RunNightAuditUseCase {
            <<Use Case>>
            +execute(property_id: PropertyId, business_date: date) NightAuditRunId
        }
        class PostRoomChargeService {
            <<Application Service · US-15>>
            +post_nightly_charge(reservation: Reservation, business_date: date, run_id: NightAuditRunId) None
        }
        class NightAuditRunRepository {
            <<Port>>
            +add(run: NightAuditRun) None
            +save(run: NightAuditRun) None
            +exists(property_id: PropertyId, business_date: date) bool
        }
        class ReservationRepository {
            <<Port · US-06>>
            +list_in_house(property_id: PropertyId) list~Reservation~
        }
        class PropertyRepository {
            <<Port>>
            +list_all() list~Property~
        }
        class NightAuditSettings {
            <<Port · cutoff PENDING>>
            +cutoff_local(property_id: PropertyId) time
        }
        class RateProvider {
            <<Port · rate structure US-03>>
            +nightly_rate(reservation: Reservation, business_date: date) Money
        }
        class TaxCalculator {
            <<Port · US-04>>
            +calculate(property_id, base: Money, on_date: date) list~TaxLine~
        }
        class Clock {
            <<Port>>
            +now_utc() datetime
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

    namespace Infrastructure {
        class RunNightAuditCommand {
            <<Django management command · invoked by cron>>
            +handle() None
        }
        class DjangoNightAuditRunRepository {
            <<Adapter>>
        }
    }

    NightAuditRun --> NightAuditStatus
    NightAuditRun ..> NightAuditCompleted : records
    NightAuditRun ..> NightAuditFailed : records

    NightAuditSchedulerJob --> PropertyRepository
    NightAuditSchedulerJob --> NightAuditSettings
    NightAuditSchedulerJob --> NightAuditSchedule
    NightAuditSchedulerJob --> NightAuditRunRepository
    NightAuditSchedulerJob --> Clock
    NightAuditSchedulerJob --> RunNightAuditUseCase
    RunNightAuditUseCase --> NightAuditRunRepository
    RunNightAuditUseCase --> ReservationRepository
    RunNightAuditUseCase --> PostRoomChargeService
    RunNightAuditUseCase --> UnitOfWork
    RunNightAuditUseCase --> EventPublisher
    RunNightAuditUseCase ..> NightAuditAlreadyRunError : raises
    PostRoomChargeService --> RateProvider
    PostRoomChargeService --> TaxCalculator

    RunNightAuditCommand --> NightAuditSchedulerJob
    DjangoNightAuditRunRepository ..|> NightAuditRunRepository
```

### Design notes
- **Timezone-aware scheduling (Scenario 2):**
  - cron runs the Django command `run_night_audit` every few minutes, in UTC;
  - for each property, `NightAuditSchedule.is_due` converts "now" to the property's IANA timezone (`America/Halifax`) and returns true once local time is past the cutoff and no run exists yet for that business date;
  - cron itself never needs to know about daylight saving time.
- **DST edge case in Halifax:** the clocks change **at 2:00 AM local**, the example cutoff in the business document.
  - **Spring forward:** 2:00 to 2:59 does not exist, so the first tick after the jump (3:00 ADT) is "past the cutoff" and the audit runs once.
  - **Fall back:** 1:00 to 1:59 happens twice, and the existing run for that business date prevents a second run.
- **No double posting:** `NIGHT_AUDIT_RUN` is unique per `(property_id, business_date)`, and every room charge carries `(reservation_id, business_date)` as a unique posting key in the folio (US-15). A retry or a second scheduler instance cannot post the same night twice. Failure and re-run *behaviour* (e.g., resuming a failed run) is PENDING.
- **Business date (to confirm):** with a cutoff after midnight (e.g., 2:00 AM on Nov 2), the audit closes the **previous** local date (Nov 1), the night the guests stayed.
- **Posting:** `PostRoomChargeService` posts the nightly rate (rate structure from US-03) and the daily taxes (US-04) to each In-House reservation's folio (US-15).
- **PENDING:**
  - the exact cutoff time (`NightAuditSettings`);
  - no-show processing during the audit;
  - behaviour after a failure.

---

## 2. ER Diagram (PostgreSQL persistence)

```mermaid
erDiagram
    PROPERTY ||--o{ NIGHT_AUDIT_RUN : "runs"
    NIGHT_AUDIT_RUN ||--o{ FOLIO_TRANSACTION : "posts"
    FOLIO ||--o{ FOLIO_TRANSACTION : "records"

    PROPERTY {
        uuid id PK "partial"
        varchar timezone "IANA, e.g., America/Halifax"
        time night_audit_cutoff_local "PENDING value, example 02:00"
    }
    NIGHT_AUDIT_RUN {
        uuid id PK
        uuid property_id FK "UNIQUE (property_id, business_date)"
        date business_date "local date being closed"
        varchar status "RUNNING, COMPLETED, FAILED"
        int posted_reservations
        text failure_reason "nullable"
        timestamptz started_at "UTC"
        timestamptz finished_at "UTC, nullable"
    }
    FOLIO_TRANSACTION {
        uuid id PK "partial: US-15"
        uuid folio_id FK
        uuid night_audit_run_id FK "nullable, set for room charges"
        date business_date "UNIQUE (folio_id, business_date) for ROOM_CHARGE"
        varchar transaction_type "ROOM_CHARGE"
    }
    FOLIO {
        uuid id PK "partial: US-15"
    }
```

### Design notes
- **`night_audit_cutoff_local`** is a property setting because the audit runs per property. Its value is PENDING.
- **Partial unique index against double posting:** `UNIQUE (folio_id, business_date) WHERE transaction_type = 'ROOM_CHARGE'`. A night can be charged only once per folio.
- **Timestamp types:** timestamps are `timestamptz` in UTC, while `business_date` is a local calendar date by definition.

---

## 3. Event Flow

### 3.1 Scheduler tick — Scenario 2

```mermaid
flowchart TD
    A["cron: run_night_audit (every few minutes, UTC)"] --> B[For each property]
    B --> C["Convert now_utc to the property timezone<br/>America/Halifax, DST-aware"]
    C --> D{"Local time past the cutoff?<br/>cutoff value PENDING"}
    D -- No --> B
    D -- Yes --> E["business_date = local date being closed"]
    E --> F{"Run exists for<br/>(property, business_date)?"}
    F -- Yes --> B
    F -- No --> G["RunNightAuditUseCase.execute(property, business_date)"]
    G --> B

    N1["Spring forward: 02:00 to 02:59 skipped,<br/>first tick at 03:00 ADT is past the cutoff, runs once"] -.-> D
    N2["Fall back: 01:00 to 01:59 repeats,<br/>existing run blocks a second execution"] -.-> F
```

### 3.2 Posting nightly charges — Scenarios 1 and 3

```mermaid
sequenceDiagram
    autonumber
    participant Job as NightAuditSchedulerJob
    participant UC as RunNightAuditUseCase
    participant Runs as NightAuditRunRepository
    participant Res as ReservationRepository
    participant Post as PostRoomChargeService (US-15)
    participant Bus as EventPublisher
    actor GM as General Manager

    Job->>UC: execute(property_id, business_date)
    UC->>Runs: add(NightAuditRun RUNNING)
    alt Run already exists (unique violation)
        Runs-->>UC: raise NightAuditAlreadyRunError
        UC-->>Job: skip
    else New run
        UC->>Res: list_in_house(property_id)
        Res-->>UC: In-House reservations
        loop each In-House reservation
            UC->>Post: post_nightly_charge(reservation, business_date, run_id)
            Post->>Post: rate (US-03) + daily taxes (US-04)
            Post->>Post: folio.post_charge(ROOM_CHARGE, unique per night)
        end
        alt All posted
            UC->>Runs: save(run COMPLETED)
            UC->>Bus: publish(NightAuditCompleted)
        else Unexpected failure
            UC->>Runs: save(run FAILED)
            UC->>Bus: publish(NightAuditFailed)
            Note over UC,Runs: Re-run / resume behaviour PENDING
        end
    end
    GM->>GM: Night Audit report available for the business date (US-22)
```

### 3.3 Domain events

| Event | Emitted by | When | Payload | Consumers |
|---|---|---|---|---|
| `ChargePosted` | `Folio` (US-15) | Each nightly room charge and tax posted | see US-15 | Folio balance, reports (US-22) |
| `NightAuditCompleted` | `RunNightAuditUseCase` | Run finished for a property and business date | `run_id`, `property_id`, `business_date`, `posted_reservations`, `occurred_at_utc` | Night Audit report availability (US-22) |
| `NightAuditFailed` | `RunNightAuditUseCase` | Run failed | `run_id`, `reason`, `occurred_at_utc` | PENDING (e.g., alert the Night Auditor) |
