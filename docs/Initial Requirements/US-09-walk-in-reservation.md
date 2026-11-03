[US-09] Walk-in Reservation

# User Story

As a Front Desk Agent, I want to create a reservation for a walk-in guest, So that I can sell available rooms at the desk quickly.

# Acceptance Criteria

* Scenario 1: Successful walk-in reservation paid by card
   * Given there is availability for tonight at my property
   * When I create a reservation with the guest's data, the guest accepts the Terms & Conditions and the card is entered in Stripe's secure fields
   * Then the system charges the full stay amount, creates the reservation as Confirmed with localized taxes applied, and I can continue to check-in
* Scenario 2: Walk-in paid in cash
   * Given there is availability for tonight at my property
   * When I create a reservation for a guest who pays the full stay amount in cash and I record the cash payment
   * Then the system records the cash payment in the folio and creates the reservation as Confirmed
* Scenario 3: No availability
   * Given there is no availability for the requested dates
   * When I try to create the reservation
   * Then the system informs me that no rooms are available
* Scenario 4: Phone booking for future dates
   * Given a guest calls to book future dates
   * When I create the reservation with the same form and enter the guest's card in Stripe's secure fields
   * Then the system charges the full stay amount and creates the reservation as Unconfirmed, as in US-06
* Scenario 5: Keyboard-only operation
   * Given I am on the walk-in reservation form
   * When I complete it using only the keyboard
   * Then I can fill in and submit every field without using the mouse

# Business Rules

* Walk-ins follow the same availability, concurrency and tax rules as other bookings.
* The reservation is created for the property where the Front Desk Agent works (see US-01).
* A walk-in reservation always starts on the current day (the property's local date), and the agent continues directly to check-in (US-12, US-13).
* Walk-ins go through the same T&C acceptance as online bookings (see US-05).
* The guest provides their full name, email, phone and PIPEDA consent (see US-20). The email is required.
* A walk-in guest pays the full stay amount when the reservation is created:
   * By card: the agent or the guest enters the card in Stripe's secure fields on the front desk screen, and the amount is charged through Stripe.
   * In cash: the agent records the cash payment in the folio (see US-15), which confirms the booking.
* Card tokenization applies only to guests paying by card.
* Walk-in reservations start as Confirmed.
* Phone bookings for future dates use the same form, are paid by card through Stripe, and start as Unconfirmed, as in US-06.
* A walk-in arriving before 4:00 PM needs the early check-in approval described in US-12.
* The front desk interface must be fast and keyboard-friendly: every field is reachable with Tab and Shift+Tab in a fixed order, the room type is chosen with the arrow keys and Enter, and Ctrl+Enter submits the form.

# Definition of Done (DoD)

* [ ] Code reviewed via Pull Request
* [ ] Test coverage implemented
* [ ] Documentation and Wiki updated
