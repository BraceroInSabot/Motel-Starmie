[US-11] Reservation Lifecycle Management

# User Story

As a Front Desk Agent, I want reservations to follow a controlled lifecycle, So that the state of each booking is always consistent.

# Acceptance Criteria

* Scenario 1: Valid transition
   * Given a reservation is in a given state
   * When an action moves it to the next allowed state
   * Then the system saves the new state and records who made the change and when
* Scenario 2: Invalid transition
   * Given a reservation is in a given state
   * When an action tries to move it to a state not allowed by the lifecycle
   * Then the system blocks the change
* Scenario 3: Cancellation without a fee
   * Given the property's cancellation window is 24 hours
   * When the guest cancels 3 days before check-in using the link in the confirmation email
   * Then the reservation changes to Canceled, the nights are released and the full amount is refunded through Stripe
* Scenario 4: Cancellation with a fee
   * Given the property's cancellation window is 24 hours and its cancellation fee is $50
   * When the guest cancels 5 hours before check-in
   * Then the reservation changes to Canceled and the amount paid minus $50 is refunded through Stripe
* Scenario 5: No-Show
   * Given a Confirmed reservation whose guest has not checked in and the property's grace period is 60 minutes
   * When the time reaches 1:00 AM after the arrival day
   * Then the reservation changes to No-Show, the nights are released and the amount paid minus the property's no-show fee is refunded
* Scenario 6: In-House reservation cannot be canceled
   * Given a reservation is In-House
   * When someone tries to cancel it
   * Then the system blocks the change and the guest must be checked out instead (see US-17)

# Business Rules

* Reservation states: Unconfirmed → Confirmed → In-House → Checked-Out, plus Canceled and No-Show.
* Allowed transitions (any other transition is blocked):

| From | To | Triggered by |
|---|---|---|
| Unconfirmed | Confirmed | Front Desk Agent or General Manager |
| Unconfirmed | Canceled | Guest (cancellation link), Front Desk Agent or General Manager |
| Confirmed | Canceled | Guest (cancellation link), Front Desk Agent or General Manager |
| Confirmed | In-House | Check-in (see US-13) |
| Confirmed | No-Show | System (no-show deadline) |
| In-House | Checked-Out | Check-out (see US-17) |

* In-House reservations cannot be canceled. A guest who leaves early is checked out (see US-17), and unused prepaid nights are refunded automatically.
* The guest cancels through the secure, unique cancellation link included in the "booking received" and "booking confirmed" emails.
* When a staff member cancels a Confirmed reservation, they indicate whether it is at the guest's request (the fee rules apply) or the motel's decision (no fee and a full refund). Rejecting an Unconfirmed booking never has a fee (see US-06).
* A Confirmed reservation becomes No-Show when the guest has not checked in by the no-show deadline: midnight at the end of the arrival day plus the property's grace period (in minutes). The system checks for no-shows every 15 minutes.
* The default grace period is 60 minutes, which gives a no-show deadline of 1:00 AM. The General Manager can change it for each property.
* Cancellation and no-show fees are optional fixed amounts in CAD, configured for each property by the General Manager.
* The cancellation fee applies only when the guest cancels less than X hours before check-in (4:00 PM on the arrival day). The General Manager sets X for each property; 0 means the fee always applies.
* When a reservation is canceled or becomes No-Show, the amount paid is refunded automatically through Stripe, minus the applicable fee.
* OTA bookings can become No-Show, but no refund or fee is processed in the system, because the OTA handles the payment (see US-07).
* Canceled and No-Show reservations release their nights, so the room can be sold again.
* Every status change is recorded with who made it (guest, staff member or system) and when.
* Every fee applied is shown in a dashboard accessible only to General Managers. From there, they can send an email to the guest about the fee.

# Definition of Done (DoD)

* [ ] Code reviewed via Pull Request
* [ ] Test coverage implemented
* [ ] Documentation and Wiki updated
