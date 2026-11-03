# US-16 — Policy Violation Fine: Diagrams

> Source: `US-16-policy-violation-fine.md`. Related: US-01 (permissions), US-04 (not taxed), US-06 (card kept by Stripe), US-10 (open reports on the dashboard), US-13 (hold and cash deposit), US-15 (folio), US-17 (collection at check-out).

## Business rules reflected

| Rule (US-16) | Where it appears |
|---|---|
| Cannabis Cleaning Fine $250 CAD by default, editable by the GM | Seeded `FINE_TYPE` per property |
| Other fine types and amounts defined by the GM on a settings page | `FineTypeViews` (`SETTINGS`) |
| Fines per property; removal deactivates | `FINE_TYPE.property_id`, `is_active` |
| Not taxed | `FINE` entry posts no tax lines |
| Housekeeper reports with 1–5 photos (JPG, PNG, HEIC), ≤ 10 MB each | `EvidencePolicy`, `ReportViolationUseCase` |
| Evidence kept until the GM deletes it | `DeleteEvidenceUseCase` (GM), `deleted_at` |
| FDA reviews: posts the fine linked to the report, or dismisses with a reason; never fined twice | `ReviewViolationUseCase`, `UNIQUE (violation_report_id)` on the fine entry |
| Guest emailed (fine name and amount, no photos) in their language | `Notifier.fine_posted()` |
| Collected at check-out from the hold or cash deposit | US-17 step 1 |
| Excess charged to the kept card; if declined, check-out blocked until paid at the desk | US-17 steps 2 and 4 |
| GM can post a fine within 7 days after check-out, charged to the kept card, with an email | `PostLateFineUseCase` |

---

## 1. Class Diagram (Clean Architecture)

```mermaid
classDiagram
    direction LR

    namespace Domain {
        class FineType {
            <<Entity>>
            +FineTypeId id
            +PropertyId property_id
            +LocalizedText name
            +Money amount
            +bool is_active
        }
        class ViolationReport {
            <<Aggregate Root>>
            +ReportId id
            +PropertyId property_id
            +RoomId room_id
            +ReservationId reservation_id
            +StaffId reported_by
            +str description
            +ReportStatus status
            +list~EvidencePhoto~ photos
            +mark_fined(staff) None
            +dismiss(staff, reason) None
        }
        class ReportStatus {
            <<Enumeration>>
            OPEN
            FINED
            DISMISSED
        }
        class EvidencePhoto {
            <<Entity>>
            +str file_key
            +str mime_type
            +int size_bytes
            +datetime deleted_at
        }
        class EvidencePolicy {
            <<Domain Service>>
            +MIN_PHOTOS = 1
            +MAX_PHOTOS = 5
            +MAX_BYTES = 10 MB
            +ALLOWED = JPG, PNG, HEIC
            +validate(files) None
        }
        class LateFinePolicy {
            <<Domain Service>>
            +WINDOW_DAYS = 7
            +assert_within_window(checked_out_at, now) None
        }
    }

    namespace Application {
        class ReportViolationUseCase {
            <<HOUSEKEEPING_BOARD>>
            +execute(room_id, description, files, housekeeper) ViolationReport
        }
        class ReviewViolationUseCase {
            <<FRONT_DESK_WORK>>
            +post_fine(report_id, fine_type_id, agent) None
            +dismiss(report_id, reason, agent) None
        }
        class PostLateFineUseCase {
            <<GM>>
            +execute(reservation_id, fine_type_id, gm) None
        }
        class ManageFineTypesUseCase {
            <<SETTINGS · GM>>
        }
        class DeleteEvidenceUseCase {
            <<GM>>
        }
        class FolioService {
            <<US-15>>
        }
        class PaymentGateway {
            <<Port>>
            +charge_off_session(customer, payment_method, amount, key) ChargeResult
        }
        class EvidenceStorage {
            <<Port>>
        }
        class Notifier {
            <<Port>>
            +fine_posted(guest, fine, language) None
        }
    }

    namespace Infrastructure {
        class FileSystemEvidenceStorage
        class StripePaymentGateway
        class EmailNotifier
    }

    namespace Interface {
        class ViolationViews {
            <<REST>>
            POST /api/v1/rooms/id/violation-reports
            POST /api/v1/violation-reports/id/fine
            POST /api/v1/violation-reports/id/dismiss
            POST /api/v1/reservations/id/late-fines
        }
        class FineTypeViews {
            <<REST · SETTINGS>>
            /api/v1/properties/id/fine-types
        }
    }

    ViolationReport --> ReportStatus
    ViolationReport *-- EvidencePhoto
    ReportViolationUseCase --> EvidencePolicy
    ReportViolationUseCase --> EvidenceStorage
    ReviewViolationUseCase --> FolioService
    ReviewViolationUseCase --> Notifier
    ReviewViolationUseCase ..> FineType
    PostLateFineUseCase --> LateFinePolicy
    PostLateFineUseCase --> FolioService
    PostLateFineUseCase --> PaymentGateway
    PostLateFineUseCase --> Notifier
    DeleteEvidenceUseCase --> EvidenceStorage
    FileSystemEvidenceStorage ..|> EvidenceStorage
    StripePaymentGateway ..|> PaymentGateway
    EmailNotifier ..|> Notifier
    ViolationViews --> ReportViolationUseCase
    ViolationViews --> ReviewViolationUseCase
    ViolationViews --> PostLateFineUseCase
    FineTypeViews --> ManageFineTypesUseCase
```

### Design notes
- **Report:** the Housekeeper reports from the housekeeping board for a room; the system links the report to the reservation currently In-House in that room. The report appears on the front desk dashboard as an open violation report (US-10).
- **Review:** only `OPEN` reports can be fined or dismissed. Posting a fine writes a `FINE` entry (debit guest receivable, credit fine revenue, no tax) with `violation_report_id`; the unique constraint makes a second fine impossible even under concurrency. After commit, the guest gets an email with the fine name and amount, without photos.
- **Collection** is not done at posting time; it happens at check-out (US-17 steps 1 and 2).
- **Late fine:** the GM picks a fine type for a `CHECKED_OUT` reservation whose check-out was within the last 7 days; the system posts the fine and charges it off-session to the card kept by Stripe, then posts `STRIPE_CARD`, and emails the guest. Cash and OTA guests without a kept card: not described by US-16.
- **Evidence:** files are validated by type and size before storage; the GM can delete them (soft delete of the row, file removed from storage).

---

## 2. ER Diagram

```mermaid
erDiagram
    PROPERTY ||--o{ FINE_TYPE : "defines"
    PROPERTY ||--o{ VIOLATION_REPORT : "receives"
    ROOM ||--o{ VIOLATION_REPORT : "location"
    RESERVATION ||--o{ VIOLATION_REPORT : "stay"
    VIOLATION_REPORT ||--|{ VIOLATION_PHOTO : "evidence"
    VIOLATION_REPORT ||--o| LEDGER_ENTRY : "fined as"
    FINE_TYPE ||--o{ LEDGER_ENTRY : "priced"

    FINE_TYPE {
        uuid id PK
        uuid property_id FK
        varchar name_en
        varchar name_fr
        numeric amount "Cannabis Cleaning default 250.00"
        char currency "CAD"
        boolean is_active
    }
    VIOLATION_REPORT {
        uuid id PK
        uuid property_id FK
        uuid room_id FK
        uuid reservation_id FK
        uuid reported_by FK "Housekeeper"
        text description
        varchar status "OPEN, FINED, DISMISSED"
        uuid reviewed_by FK "Front Desk Agent"
        text dismiss_reason
        timestamptz reported_at
        timestamptz reviewed_at
    }
    VIOLATION_PHOTO {
        uuid id PK
        uuid report_id FK
        varchar file_key
        varchar mime_type "image/jpeg, image/png, image/heic"
        int size_bytes "max 10 MB"
        timestamptz deleted_at "GM deletion"
    }
    LEDGER_ENTRY {
        uuid id PK "US-15"
        varchar entry_type "FINE"
        uuid violation_report_id FK, UK "never fined twice"
        uuid fine_type_id FK
        numeric amount
    }
```

---

## 3. Event Flow

### 3.1 Report, review and email — Scenarios 1 to 3

```mermaid
sequenceDiagram
    autonumber
    actor HK as Housekeeper
    actor FDA as Front Desk Agent
    participant View as ViolationViews
    participant Report as ReportViolationUseCase
    participant Review as ReviewViolationUseCase
    participant Folio as FolioService
    participant Mail as Notifier

    HK->>View: POST report (room, description, 1 to 5 photos)
    View->>Report: execute(...)
    Report-->>FDA: open violation report on the dashboard
    FDA->>View: opens the report and its photos
    alt post the fine
        View->>Review: post_fine(report, fine type)
        Review->>Folio: FINE entry linked to the report (not taxed)
        Review->>Review: report FINED
        Review-->>Mail: after commit: fine name and amount, guest language, no photos
    else dismiss
        View->>Review: dismiss(report, reason)
        Review->>Review: report DISMISSED, no fine
    end
```

### 3.2 Collection — Scenarios 4 to 6

```mermaid
flowchart TD
    A{When?} -- at check-out --> B["Unpaid fines captured from the hold<br/>or deducted from the cash deposit (US-17 step 1)"]
    B --> C{Balance larger than the hold or deposit?}
    C -- no --> D[Rest of the hold released or deposit returned]
    C -- yes --> E[Rest charged to the card kept by Stripe]
    E --> F{Charge declined?}
    F -- no --> D
    F -- yes --> G[Check-out blocked until the guest pays at the desk]
    A -- "after check-out, within 7 days" --> H[GM posts the fine]
    H --> I[Charged to the card kept by Stripe and guest emailed]
```

### 3.3 Domain events

| Event | Raised when | Consumers |
|---|---|---|
| `ViolationReported` | Housekeeper submits a report | Front desk dashboard (US-10) |
| `FinePosted` | FDA posts a fine or GM posts a late fine | Guest email, folio balance (US-15) |
| `ViolationReportDismissed` | FDA dismisses | Dashboard |
| `EvidenceDeleted` | GM deletes photos | Audit log |
