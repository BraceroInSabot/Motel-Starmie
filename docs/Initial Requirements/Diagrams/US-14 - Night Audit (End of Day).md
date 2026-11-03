# US-14 — Night Audit (End of Day): Diagrams

> Source: `US-14-night-audit-end-of-day.md`. Related: US-03 (nightly rate), US-04 (taxes), US-06 (payment as credit), US-15 (folio), US-22 (Night Audit report and exceptions list).

## Business rules reflected

| Rule (US-14) | Where it appears |
|---|---|
| Automated process, separate per property | `RunNightAuditUseCase(property_id)`, one run per property |
| Fixed cutoff 2:00 AM local time | `NightAuditSchedule.CUTOFF = 02:00` |
| The 2:00 AM run closes the previous local date | `business_date = local_today − 1 day` |
| Posts room rate and taxes for the night of every In-House reservation | `NightlyPostingService` |
| Each night charged once; repeated runs skip charged nights | `UNIQUE (reservation_id, stay_date)` on `NIGHT_CHARGE` |
| Missed nights caught up at the next run | Posts every uncharged night up to the business date |
| Booking payment stays as a credit; charges posted against it | Folio entries (US-15) |
| Timezone-aware cron; UTC timestamps | `NightAuditScheduler` with `ZoneInfo` |
| DST: spring forward runs at 3:00 AM; fall back runs once | `NightAuditSchedule.next_run()` and the unique run key |
| One reservation fails → exceptions list, run continues | `NIGHT_AUDIT_EXCEPTION` |
| Whole run fails → retry every 15 minutes, 3 times, then email the developer | `RetryPolicy`, `DeveloperAlert` |
| Errors in application logs; every run stored in the database | `NIGHT_AUDIT_RUN`, logger |
| Developer email in an environment variable, default guibragon@gmail.com | `NIGHT_AUDIT_ALERT_EMAIL` setting |
| No-show processing not part of it | Handled by US-11 |

---

## 1. Class Diagram (Clean Architecture)

```mermaid
classDiagram
    direction LR

    namespace Domain {
        class NightAuditSchedule {
            <<Domain Service>>
            +CUTOFF = 02:00
            +next_run(timezone, after_utc) datetime
            +business_date(run_local_date) date
        }
        class NightAuditRun {
            <<Aggregate Root>>
            +RunId id
            +PropertyId property_id
            +date business_date
            +RunStatus status
            +int attempt
            +list~AuditException~ exceptions
            +start() None
            +finish() None
            +fail(error) None
        }
        class RunStatus {
            <<Enumeration>>
            RUNNING
            SUCCEEDED
            SUCCEEDED_WITH_EXCEPTIONS
            FAILED
        }
        class AuditException {
            <<Value Object>>
            +ReservationId reservation_id
            +str error
        }
        class NightlyPostingService {
            <<Domain Service>>
            +nights_to_charge(reservation, business_date, charged) list~date~
        }
        class RetryPolicy {
            <<Value Object>>
            +INTERVAL_MINUTES = 15
            +MAX_RETRIES = 3
        }
    }

    namespace Application {
        class RunNightAuditUseCase {
            +execute(property_id, business_date) NightAuditRun
        }
        class InHouseReader {
            <<Port>>
            +in_house(property_id) list~Reservation~
        }
        class NightChargeRepository {
            <<Port>>
            +charged_nights(reservation_id) set~date~
        }
        class TaxEngine {
            <<US-04>>
        }
        class NightlyRatePolicy {
            <<US-03>>
        }
        class FolioService {
            <<US-15>>
            +post_room_night(folio, night, rate, taxes, run_id) None
        }
        class RunRepository {
            <<Port>>
        }
        class DeveloperAlert {
            <<Port>>
            +send(subject, details) None
        }
    }

    namespace Infrastructure {
        class NightAuditScheduler {
            <<cron · timezone-aware>>
        }
        class EmailDeveloperAlert {
            <<env NIGHT_AUDIT_ALERT_EMAIL>>
        }
        class DjangoRunRepository
    }

    NightAuditRun --> RunStatus
    NightAuditRun *-- AuditException
    RunNightAuditUseCase --> InHouseReader
    RunNightAuditUseCase --> NightChargeRepository
    RunNightAuditUseCase --> NightlyPostingService
    RunNightAuditUseCase --> NightlyRatePolicy
    RunNightAuditUseCase --> TaxEngine
    RunNightAuditUseCase --> FolioService
    RunNightAuditUseCase --> RunRepository
    NightAuditScheduler --> NightAuditSchedule
    NightAuditScheduler --> RunNightAuditUseCase
    NightAuditScheduler --> RetryPolicy
    NightAuditScheduler --> DeveloperAlert
    EmailDeveloperAlert ..|> DeveloperAlert
    DjangoRunRepository ..|> RunRepository
```

### Design notes
- **Schedule:** the scheduler wakes every minute and, for each property, computes the next 2:00 AM local run with `ZoneInfo("America/Halifax")`. On the spring-forward day 2:00 AM does not exist, so the first valid moment is 3:00 AM. On the fall-back day 2:00 AM happens once in the fold-0 interpretation; the unique key `(property_id, business_date)` guarantees a single run.
- **Per reservation (own savepoint):** `nights_to_charge` returns every night from check-in up to and including the business date that has no `NIGHT_CHARGE` yet (catch-up, Scenario 4; no double charge, Scenario 3). Each night posts one `ROOM_NIGHT` charge and one charge per tax line (levy, HST). A failure rolls back that reservation only and adds an exception (Scenario 5).
- **Run failure:** if the whole run fails (e.g., database unavailable), the run is marked `FAILED`, the error is logged, and the scheduler retries every 15 minutes up to 3 times; after the third failed retry, `DeveloperAlert` emails the address in `NIGHT_AUDIT_ALERT_EMAIL` (default guibragon@gmail.com).
- **Credit balance:** the booking payment (US-06) or OTA prepaid amount (US-07) is already a credit, so nightly charges bring the balance toward zero.

---

## 2. ER Diagram

```mermaid
erDiagram
    PROPERTY ||--o{ NIGHT_AUDIT_RUN : "audited by"
    NIGHT_AUDIT_RUN ||--o{ NIGHT_AUDIT_EXCEPTION : "lists"
    NIGHT_AUDIT_RUN ||--o{ NIGHT_CHARGE : "posts"
    RESERVATION ||--o{ NIGHT_CHARGE : "charged for"
    NIGHT_CHARGE ||--|{ LEDGER_ENTRY : "room night and taxes"

    NIGHT_AUDIT_RUN {
        uuid id PK
        uuid property_id FK
        date business_date "UK with property_id"
        varchar status "RUNNING, SUCCEEDED, SUCCEEDED_WITH_EXCEPTIONS, FAILED"
        smallint attempt "1 to 4"
        timestamptz started_at
        timestamptz finished_at
        text error
    }
    NIGHT_AUDIT_EXCEPTION {
        uuid id PK
        uuid run_id FK
        uuid reservation_id FK
        text error
    }
    NIGHT_CHARGE {
        uuid id PK
        uuid reservation_id FK
        date stay_date "UK with reservation_id"
        uuid run_id FK
    }
    LEDGER_ENTRY {
        uuid id PK "US-15"
        uuid night_charge_id FK
        varchar entry_type "ROOM_NIGHT or TAX"
        numeric amount
    }
    RESERVATION {
        uuid id PK "US-06"
        varchar status "IN_HOUSE selected"
    }
```

---

## 3. Event Flow

### 3.1 Nightly run — Scenarios 1, 3, 4 and 5

```mermaid
sequenceDiagram
    autonumber
    participant Cron as NightAuditScheduler
    participant UC as RunNightAuditUseCase
    participant Reader as InHouseReader
    participant Charges as NightChargeRepository
    participant Folio as FolioService
    participant Runs as RunRepository

    Cron->>UC: execute(property, business date = previous local date)
    UC->>Runs: start run (unique property and date)
    UC->>Reader: in_house(property)
    loop each In-House reservation
        UC->>Charges: charged_nights(reservation)
        alt posting succeeds
            loop each uncharged night up to the business date
                UC->>Folio: ROOM_NIGHT + Marketing Levy + HST
            end
        else posting fails
            UC->>Runs: add exception (reservation, error)
        end
    end
    UC->>Runs: finish (SUCCEEDED or SUCCEEDED_WITH_EXCEPTIONS)
```

### 3.2 Schedule, DST and retries — Scenario 2

```mermaid
flowchart TD
    A[2:00 AM local time] --> B{Spring-forward day?}
    B -- yes --> C[Run at 3:00 AM]
    B -- no --> D{Run for this business date exists?}
    C --> D
    D -- yes --> Z[Skip, fall-back day runs once]
    D -- no --> E[Run]
    E --> F{Whole run failed?}
    F -- no --> G[Stored, report available in US-22]
    F -- yes --> H{Retries done < 3?}
    H -- yes --> I[Retry in 15 minutes] --> E
    H -- no --> J[Email the developer, error in logs]
```

### 3.3 Domain events

| Event | Raised when | Consumers |
|---|---|---|
| `NightAuditCompleted` | Run finishes | Night Audit report (US-22) |
| `RoomNightPosted` | Night charged | Folio balance (US-15), occupancy report (US-23) |
| `NightAuditFailed` | Third retry fails | Developer email |
