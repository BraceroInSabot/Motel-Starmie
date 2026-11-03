# US-11 — Reservation Lifecycle Management: Diagrams

> Source: `US-11-reservation-lifecycle-management.md`. Related: US-06 (rejection), US-07 (OTA), US-13 (check-in), US-15 (folio), US-17 (check-out and early departure), US-22 (Held Funds report for failed card refunds and owed cash refunds).

## Business rules reflected

| Rule (US-11) | Where it appears |
|---|---|
| States and the allowed transitions table; any other transition blocked | `ReservationStateMachine.TRANSITIONS`, state diagram 3.1 |
| In-House cannot be canceled; early departure is a check-out with unused nights refunded | No `IN_HOUSE → CANCELED` transition; US-17 |
| Guest cancels through a secure, unique link in both emails | `CancellationToken`, `GuestCancellationView` |
| Staff cancel a Confirmed reservation as guest's request (fees apply) or motel's decision (no fee, full refund) | `CancellationReason` |
| Rejecting an Unconfirmed booking never has a fee | `MOTEL_DECISION` for rejections (US-06) |
| No-show deadline: midnight ending the arrival day + grace period; checked every 15 minutes | `NoShowDeadline`, `MarkNoShowsJob` |
| Default grace period 60 minutes (1:00 AM), editable per property | `PROPERTY.no_show_grace_minutes` |
| Optional fixed cancellation and no-show fees per property | `PROPERTY.cancellation_fee_amount`, `no_show_fee_amount` (nullable) |
| Cancellation fee only within X hours before 4:00 PM on the arrival day; 0 = always | `CancellationFeePolicy`, `cancellation_fee_window_hours` |
| Refund minus the applicable fee, by the method used to pay: card → Stripe automatically; cash → at the desk | `RefundService` chooses `RefundMethod` from the folio payments |
| Cash refund to an absent guest stays owed, shown in Held Funds, paid later from the reservation | `REFUND.status = OWED`, `PayCashRefundUseCase`, Scenario 8 |
| Lifecycle refunds are not corrections, so Front Desk Agents perform them | `FRONT_DESK_WORK` permission on cancel and cash-refund endpoints |
| OTA bookings: No-Show allowed, no refund or fee | `FeeAndRefundPolicy` skips channel `OTA` |
| Canceled and No-Show release their nights | `RoomInventory.release()` |
| Every status change recorded with who and when | `RESERVATION_STATUS_HISTORY` |
| Fees shown in a GM-only dashboard with an email action | `FeeDashboardViews`, `NotifyGuestAboutFeeUseCase` |

---

## 1. Class Diagram (Clean Architecture)

```mermaid
classDiagram
    direction LR

    namespace Domain {
        class ReservationStateMachine {
            <<Domain Service>>
            +TRANSITIONS
            +assert_allowed(from, to, actor) None
        }
        class ActorType {
            <<Enumeration>>
            GUEST
            STAFF
            SYSTEM
        }
        class CancellationReason {
            <<Enumeration>>
            GUEST_REQUEST
            MOTEL_DECISION
        }
        class PropertyPolicy {
            <<Value Object>>
            +int no_show_grace_minutes
            +Money cancellation_fee
            +int cancellation_fee_window_hours
            +Money no_show_fee
        }
        class NoShowDeadline {
            <<Domain Service>>
            +for_reservation(arrival_date, timezone, grace) datetime
        }
        class CancellationFeePolicy {
            <<Domain Service>>
            +CHECK_IN_FROM = 16:00
            +fee(policy, arrival_date, canceled_at, reason) Money
        }
        class FeeAndRefundPolicy {
            <<Domain Service>>
            +settle(reservation, amount_paid, fee) Settlement
        }
        class Settlement {
            <<Value Object>>
            +Money fee
            +Money refund
        }
        class CancellationToken {
            <<Value Object>>
            +str token_hash
        }
    }

    namespace Application {
        class ChangeReservationStatusService {
            <<Application Service>>
            +transition(reservation, to, actor, reason) None
        }
        class CancelReservationUseCase {
            +execute(reservation_id, actor, reason) None
        }
        class CancelByGuestLinkUseCase {
            +execute(token) None
        }
        class MarkNoShowsUseCase {
            +execute(now_utc) int
        }
        class RefundService {
            +refund(reservation, amount, guest_present) RefundResult
        }
        class PayCashRefundUseCase {
            <<FRONT_DESK_WORK>>
            +execute(refund_id, staff) None
        }
        class RefundMethod {
            <<Enumeration>>
            CARD
            CASH
        }
        class FolioService {
            <<US-15>>
            +post_fee(folio, type, amount) None
            +post_refund(folio, method, amount, ref) None
        }
        class NotifyGuestAboutFeeUseCase {
            <<GM>>
            +execute(fee_entry_id, gm) None
        }
        class GetFeeDashboardUseCase {
            <<Query · GM>>
        }
        class PaymentGateway {
            <<Port>>
        }
        class InventoryRepository {
            <<Port>>
        }
        class Notifier {
            <<Port>>
        }
        class Clock {
            <<Port>>
        }
    }

    namespace Infrastructure {
        class MarkNoShowsJob {
            <<cron · every 15 min>>
        }
        class StripePaymentGateway
        class EmailNotifier
    }

    namespace Interface {
        class ReservationStatusViews {
            <<REST · FRONT_DESK_WORK>>
            POST /api/v1/reservations/id/cancel
            POST /api/v1/refunds/id/pay-cash
        }
        class GuestCancellationView {
            <<REST · public, token>>
            POST /api/v1/cancellations/token
        }
        class FeeDashboardViews {
            <<REST · FINANCIAL_REPORTS>>
            GET /api/v1/properties/id/fees
            POST /api/v1/fees/id/notify
        }
    }

    ReservationStateMachine ..> ActorType
    CancelReservationUseCase --> ChangeReservationStatusService
    CancelReservationUseCase --> CancellationFeePolicy
    CancelReservationUseCase --> FeeAndRefundPolicy
    CancelReservationUseCase --> RefundService
    CancelReservationUseCase --> FolioService
    CancelReservationUseCase --> InventoryRepository
    CancelReservationUseCase ..> CancellationReason
    CancelByGuestLinkUseCase --> CancelReservationUseCase
    CancelByGuestLinkUseCase ..> CancellationToken
    MarkNoShowsUseCase --> NoShowDeadline
    MarkNoShowsUseCase --> ChangeReservationStatusService
    MarkNoShowsUseCase --> FeeAndRefundPolicy
    MarkNoShowsUseCase --> RefundService
    MarkNoShowsUseCase --> InventoryRepository
    MarkNoShowsUseCase --> Clock
    ChangeReservationStatusService --> ReservationStateMachine
    FeeAndRefundPolicy ..> Settlement
    CancellationFeePolicy ..> PropertyPolicy
    RefundService --> PaymentGateway
    RefundService ..> RefundMethod
    PayCashRefundUseCase --> FolioService
    ReservationStatusViews --> PayCashRefundUseCase
    NotifyGuestAboutFeeUseCase --> Notifier
    MarkNoShowsJob --> MarkNoShowsUseCase
    StripePaymentGateway ..|> PaymentGateway
    EmailNotifier ..|> Notifier
    ReservationStatusViews --> CancelReservationUseCase
    GuestCancellationView --> CancelByGuestLinkUseCase
    FeeDashboardViews --> GetFeeDashboardUseCase
    FeeDashboardViews --> NotifyGuestAboutFeeUseCase
```

### Design notes
- **Cancellation fee (`CancellationFeePolicy`):** fee = `cancellation_fee` only if the reason is `GUEST_REQUEST`, a fee is configured, and `canceled_at > check-in moment − X hours`, where the check-in moment is 4:00 PM local time on the arrival day. `X = 0` means the fee always applies. Scenario 4: $50 fee → refund = amount paid − $50.
- **No-show deadline (`NoShowDeadline`):** midnight at the end of the arrival day (local) + `no_show_grace_minutes`; default 60 → 1:00 AM. The job runs every 15 minutes and selects `CONFIRMED` reservations past their deadline.
- **Settlement (`FeeAndRefundPolicy`):** for channel `OTA`, fee and refund are both zero. Otherwise the fee is posted as a `CANCELLATION_FEE` or `NO_SHOW_FEE` charge (not taxed, US-04) and the refund is the amount paid minus the fee.
- **Refund failures:** `REFUND.status = FAILED` stays visible in the Held Funds report (US-22) with a "Retry refund" action.
- **Unconfirmed cancellations by staff** are rejections: reason `MOTEL_DECISION`, no fee (US-06). A guest canceling an Unconfirmed booking through the link is a `GUEST_REQUEST`.
- **Guest link:** the token is random, stored only as a hash, and unique per reservation; it is included in the "booking received" and "booking confirmed" emails.
- **Refund method (`RefundService`):** the method follows the folio's payments. Card payments (`STRIPE_CARD`) are refunded through Stripe (`REFUND_STRIPE` entry). Cash payments (`CASH`) are refunded in cash: if the guest is at the desk (cancellation at the desk, Scenario 7), the agent hands over the amount and the system posts `REFUND_CASH` at once; otherwise (No-Show, cancellation by link) a `REFUND` row with method `CASH` and status `OWED` is created and shown in the Held Funds report (US-22). `PayCashRefundUseCase` posts `REFUND_CASH` and sets the row to `PAID` when the guest collects it.
- **Permissions:** cancellations and cash refunds need `FRONT_DESK_WORK`; GM corrections (US-15) are a separate flow.

---

## 2. ER Diagram

```mermaid
erDiagram
    PROPERTY ||--o{ RESERVATION : "receives"
    RESERVATION ||--o{ RESERVATION_STATUS_HISTORY : "records"
    RESERVATION ||--o{ REFUND : "refunded by"
    RESERVATION ||--|| FOLIO : "has"
    FOLIO ||--o{ LEDGER_ENTRY : "contains"
    LEDGER_ENTRY ||--o{ FEE_NOTIFICATION : "emailed in"

    PROPERTY {
        uuid id PK "US-02"
        int no_show_grace_minutes "default 60"
        numeric cancellation_fee_amount "nullable"
        int cancellation_fee_window_hours "0 = always"
        numeric no_show_fee_amount "nullable"
        char fee_currency "CAD"
    }
    RESERVATION {
        uuid id PK "US-06"
        varchar status
        varchar channel
        varchar cancellation_reason "GUEST_REQUEST, MOTEL_DECISION"
        varchar cancel_token_hash UK
        timestamptz no_show_deadline_utc "index for the job"
    }
    RESERVATION_STATUS_HISTORY {
        uuid id PK
        uuid reservation_id FK
        varchar from_status
        varchar to_status
        varchar actor_type "GUEST, STAFF, SYSTEM"
        uuid actor_id "staff id, null otherwise"
        varchar reason
        timestamptz changed_at
    }
    REFUND {
        uuid id PK
        uuid reservation_id FK
        numeric amount
        char currency
        varchar reason "CANCELLATION, NO_SHOW, REJECTION, EARLY_DEPARTURE, CORRECTION"
        varchar method "CARD or CASH"
        varchar stripe_refund_id "CARD only"
        varchar status "CARD: PENDING, SUCCEEDED, FAILED. CASH: OWED, PAID"
        int attempts
        text last_error
        uuid paid_by FK "CASH, staff who paid"
        timestamptz paid_at
        timestamptz created_at
    }
    LEDGER_ENTRY {
        uuid id PK "US-15"
        varchar entry_type "CANCELLATION_FEE, NO_SHOW_FEE, REFUND_STRIPE, REFUND_CASH"
        numeric amount
    }
    FEE_NOTIFICATION {
        uuid id PK
        uuid ledger_entry_id FK
        uuid sent_by FK "GM"
        timestamptz sent_at
    }
    FOLIO {
        uuid id PK "US-15"
    }
```

---

## 3. Event Flow

### 3.1 Reservation state machine

```mermaid
stateDiagram-v2
    [*] --> Unconfirmed : direct or phone booking
    [*] --> Confirmed : walk-in or OTA booking
    Unconfirmed --> Confirmed : FDA or GM confirms
    Unconfirmed --> Canceled : guest link, FDA or GM
    Confirmed --> Canceled : guest link, FDA or GM
    Confirmed --> InHouse : check-in (US-13)
    Confirmed --> NoShow : system, no-show deadline
    InHouse --> CheckedOut : check-out (US-17)
    Canceled --> [*]
    NoShow --> [*]
    CheckedOut --> [*]
```

### 3.2 Cancellation — Scenarios 3, 4 and 6

```mermaid
sequenceDiagram
    autonumber
    actor Who as Guest (link) or staff
    participant View as Cancel endpoint
    participant UC as CancelReservationUseCase
    participant SM as ReservationStateMachine
    participant Fee as CancellationFeePolicy
    participant Folio as FolioService
    participant Refund as RefundService

    Who->>View: cancel (staff give the reason)
    View->>UC: execute(id, actor, reason)
    UC->>SM: assert_allowed(status, CANCELED)
    alt In-House or other blocked transition
        UC-->>Who: 409 blocked, check the guest out instead
    else allowed
        UC->>Fee: fee(policy, arrival date, now, reason)
        UC->>UC: status CANCELED, history (who, when), nights released
        opt fee applies and channel is not OTA
            UC->>Folio: post CANCELLATION_FEE (not taxed)
        end
        opt channel is not OTA
            UC->>Refund: refund(amount paid minus fee)
            Note over UC,Refund: card - Stripe refund<br/>cash, guest at the desk - cash handed over, REFUND_CASH<br/>cash, guest absent - cash refund OWED (Held Funds)
        end
        UC-->>Who: 200 Canceled
    end
```

### 3.3 No-show job — Scenario 5

```mermaid
sequenceDiagram
    autonumber
    participant Cron as MarkNoShowsJob (every 15 min)
    participant UC as MarkNoShowsUseCase
    participant Folio as FolioService
    participant Refund as RefundService

    Cron->>UC: execute(now)
    loop each CONFIRMED reservation past midnight + grace period
        UC->>UC: status NO_SHOW, actor SYSTEM, nights released
        alt OTA booking
            Note over UC: no fee and no refund in the system
        else other channels
            opt property has a no-show fee
                UC->>Folio: post NO_SHOW_FEE
            end
            UC->>Refund: refund(amount paid minus fee)
        end
    end
```

### 3.4 Domain events

| Event | Raised when | Consumers |
|---|---|---|
| `ReservationStatusChanged` | Any transition | Status history, dashboard (US-10) |
| `ReservationCanceled` | Cancellation | Inventory release, refund, fee dashboard |
| `ReservationMarkedNoShow` | No-show job | Inventory release, refund, fee dashboard |
| `FeeApplied` | Cancellation or no-show fee posted | Fee dashboard (GM) |
| `RefundFailed` | Stripe refund fails | Held Funds report (US-22) |
| `CashRefundOwed` / `CashRefundPaid` | Cash refund for an absent guest / paid at the desk | Held Funds report (US-22), folio |
| `GuestNotifiedAboutFee` | GM sends the fee email | Audit log |
