# US-12 — Check-in with Age Verification: Diagrams

> Source: `US-12-check-in-with-age-verification.md`. Related: US-01 (GM-only override), US-11 (cancellation at the guest's request), US-13 (rest of the check-in).

## Business rules reflected

| Rule (US-12) | Where it appears |
|---|---|
| Check-in from 4:00 PM local time | `CheckInWindow` |
| Only the registering guest shows ID | One `IdVerification` per reservation |
| Accepted IDs: driver's licence, passport, provincial/territorial photo ID | `IdType` |
| Age from the date of birth against the local check-in date | `AgePolicy.age_on(dob, local_date)` |
| Under 21 blocked unless the GM overrides (US-01) | `AgePolicy.MIN_AGE = 21`, `AGE_OVERRIDE` permission |
| GM approves from their own login, on any device; the agent's screen updates | `ApproveAgeOverrideUseCase`, WebSocket push |
| Justification required (non-empty); audit stores it, who and when | `AgeOverride`, `AUDIT_LOG` |
| No override: cancel at the guest's request, fee rules apply | `CancelReservationUseCase(GUEST_REQUEST)` (US-11) |
| Early check-in approved by an FDA, no fee, while the desk is open and an Available room of the type exists | `ApproveEarlyCheckInUseCase` |
| No ID data stored; only result, ID type and verifying agent | `ID_VERIFICATION` columns (no date of birth, no number) |

---

## 1. Class Diagram (Clean Architecture)

```mermaid
classDiagram
    direction LR

    namespace Domain {
        class IdType {
            <<Enumeration>>
            DRIVERS_LICENCE
            PASSPORT
            PROVINCIAL_PHOTO_ID
        }
        class VerificationResult {
            <<Enumeration>>
            PASSED
            UNDER_AGE
            OVERRIDDEN
        }
        class AgePolicy {
            <<Domain Service>>
            +MIN_AGE = 21
            +age_on(date_of_birth, local_date) int
        }
        class CheckInWindow {
            <<Value Object>>
            +CHECK_IN_FROM = 16:00
            +is_early(now_local) bool
        }
        class IdVerification {
            <<Entity>>
            +ReservationId reservation_id
            +IdType id_type
            +VerificationResult result
            +StaffId verified_by
            +datetime verified_at
        }
        class AgeOverride {
            <<Entity>>
            +ReservationId reservation_id
            +StaffId approved_by
            +str justification
            +datetime approved_at
        }
        class EarlyCheckInApproval {
            <<Value Object>>
            +StaffId approved_by
            +datetime approved_at
        }
    }

    namespace Application {
        class VerifyGuestIdUseCase {
            +execute(reservation_id, id_type, date_of_birth, agent) VerificationResult
        }
        class ApproveAgeOverrideUseCase {
            <<AGE_OVERRIDE · GM>>
            +execute(reservation_id, justification, gm) None
        }
        class ApproveEarlyCheckInUseCase {
            +execute(reservation_id, agent) None
        }
        class CancelReservationUseCase {
            <<US-11>>
        }
        class RoomAvailabilityReader {
            <<Port>>
            +has_available_room(room_type_id) bool
        }
        class RealtimePublisher {
            <<Port>>
            +publish(channel, event) None
        }
        class AuditLog {
            <<Port>>
        }
        class Clock {
            <<Port>>
        }
    }

    namespace Infrastructure {
        class ChannelsRealtimePublisher {
            <<Django Channels · RabbitMQ>>
        }
    }

    namespace Interface {
        class CheckInViews {
            <<REST · FRONT_DESK_WORK>>
            POST /api/v1/reservations/id/id-verification
            POST /api/v1/reservations/id/early-check-in
        }
        class AgeOverrideView {
            <<REST · AGE_OVERRIDE>>
            POST /api/v1/reservations/id/age-override
        }
        class CheckInConsumer {
            <<WebSocket>>
            ws /ws/reservations/id/check-in
        }
    }

    IdVerification --> IdType
    IdVerification --> VerificationResult
    VerifyGuestIdUseCase --> AgePolicy
    VerifyGuestIdUseCase --> Clock
    VerifyGuestIdUseCase ..> IdVerification
    ApproveAgeOverrideUseCase ..> AgeOverride
    ApproveAgeOverrideUseCase --> AuditLog
    ApproveAgeOverrideUseCase --> RealtimePublisher
    ApproveEarlyCheckInUseCase --> CheckInWindow
    ApproveEarlyCheckInUseCase --> RoomAvailabilityReader
    ApproveEarlyCheckInUseCase ..> EarlyCheckInApproval
    ChannelsRealtimePublisher ..|> RealtimePublisher
    CheckInViews --> VerifyGuestIdUseCase
    CheckInViews --> ApproveEarlyCheckInUseCase
    CheckInViews --> CancelReservationUseCase
    AgeOverrideView --> ApproveAgeOverrideUseCase
    CheckInConsumer ..> RealtimePublisher
```

### Design notes
- **The date of birth is used in memory only** to compute the age; it is never persisted or logged.
- **Override (Scenarios 3 and 4):** `ApproveAgeOverrideUseCase` requires the `AGE_OVERRIDE` permission (GM only, US-01), a reservation whose verification result is `UNDER_AGE`, and a non-blank justification. It sets the result to `OVERRIDDEN`, writes the audit record and pushes `AgeOverrideApproved` to the check-in WebSocket channel, so the agent's open screen updates.
- **Early check-in (Scenario 5):** allowed when the local time is before 4:00 PM, the front desk is open (`FrontDeskHours`, US-02) and an `AVAILABLE`, active room of the booked type exists. No fee is posted.
- **No override:** the agent cancels with reason `GUEST_REQUEST`; US-11 applies the cancellation fee rules.

---

## 2. ER Diagram

```mermaid
erDiagram
    RESERVATION ||--o| ID_VERIFICATION : "verified by"
    RESERVATION ||--o| AGE_OVERRIDE : "overridden by"
    STAFF_USER ||--o{ ID_VERIFICATION : "verifies"
    STAFF_USER ||--o{ AGE_OVERRIDE : "approves"

    ID_VERIFICATION {
        uuid reservation_id PK, FK
        varchar id_type "DRIVERS_LICENCE, PASSPORT, PROVINCIAL_PHOTO_ID"
        varchar result "PASSED, UNDER_AGE, OVERRIDDEN"
        uuid verified_by FK
        timestamptz verified_at
    }
    AGE_OVERRIDE {
        uuid reservation_id PK, FK
        uuid approved_by FK "General Manager"
        text justification "not empty"
        timestamptz approved_at
    }
    RESERVATION {
        uuid id PK "US-06"
        uuid early_check_in_approved_by FK
        timestamptz early_check_in_approved_at
    }
    STAFF_USER {
        uuid id PK "US-01"
    }
```

---

## 3. Event Flow

### 3.1 ID check and GM override — Scenarios 1 to 4

```mermaid
sequenceDiagram
    autonumber
    actor FDA as Front Desk Agent
    actor GM as General Manager (own login, any device)
    participant Desk as CheckInViews
    participant Verify as VerifyGuestIdUseCase
    participant Override as ApproveAgeOverrideUseCase
    participant WS as CheckInConsumer

    FDA->>Desk: ID type and date of birth from the ID
    Desk->>Verify: execute(...)
    alt age 21 or more on the local check-in date
        Verify-->>FDA: PASSED, continue to deposit (US-13)
    else under 21
        Verify-->>FDA: UNDER_AGE, check-in blocked
        FDA->>WS: waits on the open check-in screen
        GM->>Override: opens the blocked check-in, enters a justification
        alt justification empty
            Override-->>GM: 422 justification required
        else justification given
            Override->>Override: result OVERRIDDEN, audit record (who, when, why)
            Override->>WS: AgeOverrideApproved
            WS-->>FDA: screen updates, continue to deposit
        end
    end
```

### 3.2 Check-in gate before the deposit

```mermaid
flowchart TD
    A[Check-in opened] --> B{ID verified?<br/>PASSED or OVERRIDDEN}
    B -- no --> X1[Blocked]
    X1 -. no override .-> C1["Cancel at guest's request, fees apply (US-11)"]
    B -- yes --> D{Local time before 4 PM?}
    D -- no --> G["Continue: deposit (US-13)"]
    D -- yes --> E{Desk open and Available room of the type?}
    E -- no --> X2[Wait until 4 PM]
    E -- yes --> F[FDA approves early check-in, no fee]
    F --> G
```

### 3.3 Domain events

| Event | Raised when | Consumers |
|---|---|---|
| `GuestIdVerified` | ID result saved | Dashboard flag (US-10) |
| `AgeOverrideApproved` | GM approves | Agent's check-in screen (WebSocket), audit log |
| `EarlyCheckInApproved` | FDA approves | Dashboard flag (US-10) |
