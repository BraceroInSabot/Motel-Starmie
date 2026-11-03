# US-21 — Forget Me (PII Anonymization): Diagrams

> Source: `US-21-forget-me-pii-anonymization.md`. Related: US-01 (permissions), US-06 (Stripe customer), US-15 (financial records), US-17 (invoices), US-20 (profile).

## Business rules reflected

| Rule (US-21) | Where it appears |
|---|---|
| Action in the Guest Profile module | `POST /api/v1/guests/{id}/forget` |
| FDA and GM can execute it | `GUEST_PROFILES` permission |
| Staff verify identity manually; the system does not | No identity-check step in the use case |
| Blocked while the guest has an Unconfirmed, Confirmed or In-House reservation, or an open balance | `ForgetMeEligibility` |
| Keeps only the preferred language and the financial records (dates, property, amounts) | Profile row kept with `preferred_language`; folios and reservations untouched |
| `full_name_enc`, `email_enc`, `phone_enc`, `email_hash` set to null | `GuestProfile.anonymize()` |
| Saved card and customer record at Stripe deleted | `PaymentGateway.delete_customer()` |
| Issued invoices kept unchanged | `INVOICE` rows and PDFs not touched |
| Confirmation required; cannot be undone | Front-end confirmation dialog + `confirm=true` in the request |
| Audit log with who and when, no personal data | `AUDIT_LOG` entry `GUEST_FORGOTTEN` with the guest id only |

---

## 1. Class Diagram (Clean Architecture)

```mermaid
classDiagram
    direction LR

    namespace Domain {
        class GuestProfile {
            <<Aggregate Root · US-20>>
            +anonymize(now) None
        }
        class ForgetMeEligibility {
            <<Domain Service>>
            +BLOCKING_STATUSES = UNCONFIRMED, CONFIRMED, IN_HOUSE
            +assert_eligible(active_count, open_balance) None
        }
    }

    namespace Application {
        class ForgetGuestUseCase {
            +execute(guest_id, staff, confirmed) None
        }
        class GuestReservationReader {
            <<Port>>
            +active_reservations(guest_id) int
            +open_balance(guest_id) Money
        }
        class GuestRepository {
            <<Port · US-20>>
        }
        class PaymentGateway {
            <<Port>>
            +delete_customer(customer_id) None
        }
        class AuditLog {
            <<Port>>
        }
        class UnitOfWork {
            <<Port>>
        }
    }

    namespace Infrastructure {
        class StripePaymentGateway
        class PostgresGuestReservationReader
    }

    namespace Interface {
        class ForgetMeView {
            <<REST · GUEST_PROFILES>>
            POST /api/v1/guests/id/forget
        }
    }

    namespace FrontEnd {
        class ForgetMeDialog {
            <<React · confirmation, cannot be undone>>
        }
    }

    ForgetGuestUseCase --> ForgetMeEligibility
    ForgetGuestUseCase --> GuestReservationReader
    ForgetGuestUseCase --> GuestRepository
    ForgetGuestUseCase --> PaymentGateway
    ForgetGuestUseCase --> AuditLog
    ForgetGuestUseCase --> UnitOfWork
    ForgetGuestUseCase ..> GuestProfile
    StripePaymentGateway ..|> PaymentGateway
    PostgresGuestReservationReader ..|> GuestReservationReader
    ForgetMeView --> ForgetGuestUseCase
    ForgetMeDialog ..> ForgetMeView
```

### Design notes
- **Order:** eligibility check → delete the Stripe customer (which also removes its saved cards) → in one transaction, null the four PII columns, clear `stripe_customer_id`, set `anonymized_at`, write the audit entry.
- **Stripe first:** if Stripe fails, nothing is anonymized and the staff member can retry, so the system never loses the customer id while the card still exists at Stripe.
- **Open balance** = any folio of the guest with a balance different from $0.00.
- **Reservations, folios, ledger entries and invoices** keep their foreign key to the anonymized profile, so the financial records (dates, property, amounts) remain intact (Scenario 2). The invoice PDFs already issued are not regenerated.
- **Repeat calls** on an anonymized profile return `409 already anonymized`.

---

## 2. ER Diagram

```mermaid
erDiagram
    GUEST_PROFILE ||--o{ RESERVATION : "kept, financial record"
    RESERVATION ||--|| FOLIO : "kept"
    RESERVATION ||--o| INVOICE : "kept unchanged"
    STAFF_USER ||--o{ AUDIT_LOG : "executes"

    GUEST_PROFILE {
        uuid id PK "US-20"
        bytea full_name_enc "set to null"
        bytea email_enc "set to null"
        varchar email_hash "set to null"
        bytea phone_enc "set to null"
        char preferred_language "kept"
        varchar stripe_customer_id "set to null"
        timestamptz anonymized_at
    }
    AUDIT_LOG {
        uuid id PK "US-01"
        uuid actor_id FK
        varchar action "GUEST_FORGOTTEN"
        uuid target_id "guest id, no PII"
        timestamptz created_at
    }
    RESERVATION {
        uuid id PK "US-06"
        date check_in_date
        uuid property_id FK
    }
    FOLIO {
        uuid id PK "US-15"
    }
    INVOICE {
        uuid id PK "US-17"
    }
    STAFF_USER {
        uuid id PK "US-01"
    }
```

---

## 3. Event Flow

### 3.1 Forget Me — Scenarios 1 to 3

```mermaid
sequenceDiagram
    autonumber
    actor Staff as Front Desk Agent or GM
    participant Dialog as ForgetMeDialog
    participant UC as ForgetGuestUseCase
    participant Reader as GuestReservationReader
    participant Pay as PaymentGateway
    participant Repo as GuestRepository
    participant Audit as AuditLog

    Note over Staff: identity confirmed by staff, outside the system
    Staff->>Dialog: Forget Me
    Dialog-->>Staff: confirm, this cannot be undone
    Staff->>UC: execute(guest_id, staff, confirmed = true)
    UC->>Reader: active reservations and open balance
    alt active reservation or open balance
        UC-->>Staff: 409 blocked, with the reason
    else eligible
        UC->>Pay: delete_customer(stripe_customer_id)
        UC->>Repo: null name, email, phone, email hash, customer id
        UC->>Audit: GUEST_FORGOTTEN (who, when, guest id)
        UC-->>Staff: 200 anonymized
    end
```

### 3.2 Domain events

| Event | Raised when | Consumers |
|---|---|---|
| `GuestForgotten` | Anonymization committed | Audit log |
