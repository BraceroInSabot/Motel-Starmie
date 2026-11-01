[US-06] Reservation Creation with Secure Card Tokenization
# User Story

As a guest, I want to provide my card securely and receive a confirmation in my language, So that my reservation is guaranteed.

# Acceptance Criteria

* Scenario 1: Successful reservation
   * Given I have accepted the Terms & Conditions
   * When I enter my card in the payment gateway's secure fields and confirm
   * Then the system receives a card token (never the card data), creates the reservation and emails the confirmation in my chosen language
* Scenario 2: Card tokenization fails
   * Given I am on the payment step
   * When the payment gateway fails to tokenize my card
   * Then no reservation is created and I am informed of the failure
* Scenario 3: Concurrent booking of the last room
   * Given only one room of a room type is available
   * When two guests try to book it at the same moment
   * Then only one reservation is created and the other guest is informed that the room is no longer available

# Business Rules

* Card data must never touch the backend: use the gateway's hosted elements (Stripe) for PCI-DSS compliance.
* Optimistic locking on RoomInventory prevents overbooking.
* The confirmation email is sent in the language chosen by the guest (EN/FR).
* Use Stripe.
* Initial state of a direct booking will be Unconfirmed and a employee will confirm it.
* A amount is charged at booking time.

# Definition of Done (DoD)

* [ ] Code reviewed via Pull Request
* [ ] Test coverage implemented
* [ ] Documentation and Wiki updated
