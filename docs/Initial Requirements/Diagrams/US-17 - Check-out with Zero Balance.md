# US-17 — Check-out with Zero Balance: Diagrams

> Sources: `US-17-check-out-with-zero-balance.md`, `US-13-deposit-pre-authorization-hold.md`, `US-15-folio-ledger.md`, `US-19-room-state-machine-and-cleaning-verification.md`, `docs/Business Modeling/Business Modeling.md` (Phase 4), `CLAUDE.md`.
> Elements tagged **PENDING** depend on business rules not defined yet. They are placeholders in the design, not decisions.
> Data is scoped per **Property** (Business Modeling, Section 5) even where the story text does not mention it.

---

## 1. Class Diagram (Clean Architecture)

```mermaid
classDiagram
    direction LR

    namespace Domain {
        class CheckOutService {
            <<Domain Service>>
            +check_out(reservation: Reservation, folio: Folio, room: Room) None
        }
        class Reservation {
            <<Entity · US-06 / US-11>>
            +check_out() None
            +guest_language Language
        }
        class Folio {
            <<Entity · US-15>>
            +balance() Money
        }
        class Room {
            <<Entity · US-19>>
            +mark_dirty() None
        }
        class Invoice {
            <<Entity / Aggregate Root>>
            -InvoiceId id
            -ReservationId reservation_id
            -InvoiceNumber number
            -Language language
            -list~InvoiceLine~ lines
            -Money total
            -datetime issued_at_utc
            +issue_from(folio: Folio, language: Language)$ Invoice
        }
        class InvoiceLine {
            <<Value Object>>
            +str description
            +Money amount
            +str | None tax_code
        }
        class GuestCheckedOut {
            <<Domain Event>>
            +ReservationId reservation_id
            +RoomId room_id
            +Language guest_language
            +datetime occurred_at_utc
        }
        class OutstandingBalanceError {
            <<Domain Exception>>
        }
    }

    namespace Application {
        class CheckOutUseCase {
            <<Use Case>>
            +execute(reservation_id: ReservationId, staff_member_id: StaffMemberId) CheckOutResult
        }
        class ReleaseHoldOnCheckedOut {
            <<Event Handler · after commit>>
            +handle(event: GuestCheckedOut) None
        }
        class SendInvoiceOnCheckedOut {
            <<Event Handler · after commit>>
            +handle(event: GuestCheckedOut) None
        }
        class ReservationRepository {
            <<Port · US-06>>
            +get_by_id(reservation_id) Reservation
            +save(reservation) None
        }
        class FolioRepository {
            <<Port · US-15>>
            +get_by_reservation(reservation_id) Folio
        }
        class RoomRepository {
            <<Port · US-02>>
            +get_by_id(room_id) Room
            +save(room) None
        }
        class InvoiceRepository {
            <<Port>>
            +add(invoice: Invoice) None
            +next_number(property_id: PropertyId) InvoiceNumber
        }
        class DepositHoldRepository {
            <<Port · US-13>>
            +get_active_for_reservation(reservation_id) DepositHold | None
            +save(hold) None
        }
        class PaymentGateway {
            <<Port · US-13>>
            +release(authorization_id: str, idempotency_key: str) None
        }
        class InvoiceRenderer {
            <<Port>>
            +render_pdf(invoice: Invoice) bytes
        }
        class GuestCommunicationService {
            <<Application Service · Staff Interface Language diagram>>
            +send(recipient, guest_language, template_key, context) None
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
        class CheckOutView {
            <<REST Controller>>
            +post(request, reservation_id) Response
        }
    }

    CheckOutService ..> Reservation
    CheckOutService ..> Folio
    CheckOutService ..> Room
    CheckOutService ..> OutstandingBalanceError : raises
    CheckOutService ..> GuestCheckedOut : records
    Invoice *-- InvoiceLine

    CheckOutUseCase --> CheckOutService
    CheckOutUseCase --> ReservationRepository
    CheckOutUseCase --> FolioRepository
    CheckOutUseCase --> RoomRepository
    CheckOutUseCase --> InvoiceRepository
    CheckOutUseCase --> UnitOfWork
    CheckOutUseCase --> EventPublisher
    ReleaseHoldOnCheckedOut ..> GuestCheckedOut : handles
    ReleaseHoldOnCheckedOut --> DepositHoldRepository
    ReleaseHoldOnCheckedOut --> PaymentGateway
    SendInvoiceOnCheckedOut ..> GuestCheckedOut : handles
    SendInvoiceOnCheckedOut --> InvoiceRenderer
    SendInvoiceOnCheckedOut --> GuestCommunicationService

    CheckOutView --> CheckOutUseCase
```

### Design notes
- **`CheckOutService` enforces the zero-balance rule (Scenario 2):** `folio.balance()` must equal `Money(0.00, CAD)`, otherwise `OutstandingBalanceError`. Only then does the reservation change to `CHECKED_OUT` (US-11) and the room to `DIRTY` (US-19), in one transaction.
- **The invoice is issued in the same transaction** from the folio's posted lines, in the guest's language (Scenario 3). Each property has its own invoice number sequence. Fiscal invoice-numbering requirements are PENDING.
- **External calls run after commit:**
  - **Hold release** (`ReleaseHoldOnCheckedOut`) runs after commit, so a gateway outage never blocks a check-out. It retries with the same idempotency key until the gateway confirms.
  - **Invoice email** (`SendInvoiceOnCheckedOut`) also runs after commit.
- **Hold handling (Scenario 1):**
  - **Clean stay:** the hold was never captured, so it is released in full.
  - **Fully captured (US-16):** there is nothing to release.
  - **Partially captured:** releasing the remainder is PENDING.
- **Check-out deadline:** check-out is strictly by 11:00 AM local time. Late check-out handling is PENDING, so the use case does not block or charge after 11:00 until it is defined.
- **PENDING:** when room charges are paid (booking, check-in or check-out). The model works for any of them because it only checks the final balance.

---

## 2. ER Diagram (PostgreSQL persistence)

```mermaid
erDiagram
    RESERVATION ||--o| INVOICE : "is closed by"
    INVOICE ||--|{ INVOICE_LINE : "lists"
    PROPERTY ||--o{ INVOICE : "issues"
    RESERVATION ||--o{ DEPOSIT_HOLD : "is secured by"

    INVOICE {
        uuid id PK
        uuid reservation_id FK "UNIQUE"
        uuid property_id FK
        varchar invoice_number "UNIQUE (property_id, invoice_number), fiscal format PENDING"
        varchar language "CHECK IN ('en','fr')"
        numeric total_amount "numeric(12,2), always 0.00 balance at issue"
        char currency "CAD"
        timestamptz issued_at "UTC"
        timestamptz emailed_at "UTC, nullable"
    }
    INVOICE_LINE {
        uuid id PK
        uuid invoice_id FK
        uuid folio_transaction_id FK
        varchar description "in the invoice language"
        numeric amount "numeric(12,2)"
        char currency
        varchar tax_code "nullable"
    }
    DEPOSIT_HOLD {
        uuid id PK "partial: US-13"
        varchar status "RELEASED after a clean stay"
        timestamptz released_at "UTC"
    }
    RESERVATION {
        uuid id PK "partial: US-06"
        varchar status "CHECKED_OUT"
        timestamptz checked_out_at "UTC"
    }
    PROPERTY {
        uuid id PK "partial"
    }
```

### Design notes
- **The invoice is a snapshot of the folio at check-out.** Its lines reference the folio transactions they came from, but keep their own description and amount, so later changes (e.g., anonymization, US-21) never alter an issued invoice.
- **Numbering:** invoice numbers are unique per property, generated from a per-property sequence.
- **Hold release status:** `DEPOSIT_HOLD.status = 'RELEASED'` plus `released_at` show that the after-commit release succeeded.

---

## 3. Event Flow

### 3.1 Check-out — Scenarios 1 and 2

```mermaid
sequenceDiagram
    autonumber
    actor Agent as Front Desk Agent
    participant View as CheckOutView<br/>POST /api/v1/reservations/{id}/check-out
    participant UC as CheckOutUseCase
    participant Svc as CheckOutService
    participant Repos as Reservation, Folio, Room, Invoice repositories
    participant Bus as EventPublisher
    participant Rel as ReleaseHoldOnCheckedOut
    participant GW as PaymentGateway

    Agent->>View: Click "Check-out"
    View->>UC: execute(reservation_id, staff_member_id)
    UC->>Repos: load reservation, folio, room
    UC->>Svc: check_out(reservation, folio, room)
    alt Balance is not 0.00 (Scenario 2)
        Svc-->>UC: raise OutstandingBalanceError(balance)
        UC-->>View: error
        View-->>Agent: 409 Conflict, outstanding balance shown
    else Balance is 0.00 (Scenario 1)
        Svc->>Svc: reservation.check_out() to CHECKED_OUT
        Svc->>Svc: room.mark_dirty() to DIRTY
        UC->>Repos: save reservation and room, add Invoice (guest language)
        UC->>Bus: publish(GuestCheckedOut)
        UC->>UC: commit
        UC-->>View: CheckOutResult
        View-->>Agent: 200 OK, Checked-Out
        Bus->>Rel: after commit: handle(GuestCheckedOut)
        Rel->>GW: release(authorization_id, idempotency_key)
        GW-->>Rel: released
        Rel->>Rel: hold.mark_released()
        Note over Rel,GW: Retries with the same idempotency key if the gateway is unavailable
    end
```

### 3.2 Invoice email in the guest's language — Scenario 3

```mermaid
sequenceDiagram
    autonumber
    participant Bus as EventPublisher
    participant H as SendInvoiceOnCheckedOut
    participant Rnd as InvoiceRenderer
    participant Mail as GuestCommunicationService
    actor Guest

    Bus->>H: after commit: handle(GuestCheckedOut, guest_language = FR)
    H->>Rnd: render_pdf(invoice in FR)
    Rnd-->>H: PDF
    H->>Mail: send(guest email, FR, "final_invoice", {pdf})
    Mail-->>Guest: Zero-balance invoice in French
    H->>H: invoice.emailed_at = now
```

### 3.3 Domain events

| Event | Emitted by | When | Payload | Consumers |
|---|---|---|---|---|
| `GuestCheckedOut` | `CheckOutService` | Zero-balance check-out completed | `reservation_id`, `room_id`, `guest_language`, `occurred_at_utc` | `ReleaseHoldOnCheckedOut`, `SendInvoiceOnCheckedOut` (after commit); status history (US-11); housekeeping board (US-18) |
| `RoomStateChanged` | `Room` (US-19) | Room moved to DIRTY | see US-19 | Real-time housekeeping board (US-18) |
