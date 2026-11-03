[US-06] Reservation Creation with Secure Card Tokenization

# User Story

As a guest, I want to provide my card securely and receive a confirmation in my language, So that my reservation is guaranteed.

# Acceptance Criteria

* Scenario 1: Successful reservation
   * Given I have accepted the Terms & Conditions and given my PIPEDA consent
   * When I enter my card details in Stripe's secure fields and confirm
   * Then the system receives a card token (never the card data), charges the full stay amount, creates the reservation as Unconfirmed, records the payment in the folio and emails me "booking received" in my chosen language
* Scenario 2: Card tokenization fails
   * Given I am on the payment step
   * When Stripe fails to tokenize my card
   * Then no reservation is created and I am informed of the failure
* Scenario 3: Charge declined
   * Given my card was tokenized
   * When Stripe declines the charge
   * Then no reservation is created, no room is reserved, and I see the decline message and can try another card
* Scenario 4: Concurrent booking of the last room
   * Given only one room of a room type is available
   * When two guests try to book it at the same moment
   * Then only one reservation is created and the other guest is informed that the room is no longer available
* Scenario 5: Staff confirms the booking
   * Given a reservation is Unconfirmed
   * When a staff member confirms it
   * Then the reservation changes to Confirmed and I receive a "booking confirmed" email in my chosen language
* Scenario 6: Staff rejects the booking
   * Given a reservation is Unconfirmed
   * When a staff member rejects it
   * Then the reservation is canceled, the full amount is refunded automatically through Stripe and no cancellation fee is applied

# Business Rules

* Card data must never reach the backend: the system uses Stripe's hosted elements for PCI-DSS compliance.
* The payment gateway is Stripe.
* At booking, the guest provides their full name, email, phone and PIPEDA consent (see US-20). Without consent, the booking cannot be made.
* The full stay amount (all nights plus taxes, see US-03 and US-04) is charged through Stripe at booking time and recorded as a payment in the reservation's folio (see US-15).
* If the charge is declined, no reservation is created and no room is reserved. The guest sees the decline message and can try another card.
* Stripe keeps the guest's card, and the system stores only Stripe's reference to it. The deposit hold (US-13) is placed on this card at check-in without asking for the card again. The Terms & Conditions state this.
* A direct booking starts as Unconfirmed, and a staff member confirms it.
* Unconfirmed bookings reserve the room (they count against availability) and are shown on the front desk dashboard (US-10) until they are confirmed. They do not expire automatically.
* If a staff member rejects an Unconfirmed booking, the reservation is canceled, the full amount is refunded automatically through Stripe, and no cancellation fee is applied.
* When the guest cancels, the amount paid is refunded automatically through Stripe, minus the property's cancellation fee if one is configured (see US-11).
* The guest receives two emails in their chosen language (EN/FR): "booking received" right after booking, and "booking confirmed" when a staff member confirms the booking.
* Optimistic locking on RoomInventory prevents overbooking.

# Definition of Done (DoD)

* [ ] Code reviewed via Pull Request
* [ ] Test coverage implemented
* [ ] Documentation and Wiki updated
