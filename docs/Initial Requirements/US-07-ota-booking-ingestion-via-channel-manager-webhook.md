[US-07] OTA Booking Ingestion via Channel Manager Webhook
# User Story

As a General Manager, I want bookings pushed by the channel manager to be created exactly once, So that repeated webhooks never cause duplicate reservations or overbooking.

# Acceptance Criteria

* Scenario 1: New OTA booking
   * Given the channel manager sends a booking webhook with an OTA Booking ID not yet received
   * When the system processes the webhook
   * Then a reservation is created linked to that OTA Booking ID, with localized taxes applied
* Scenario 2: Duplicate webhook
   * Given a reservation already exists for an OTA Booking ID
   * When the channel manager sends the same booking again
   * Then no new reservation is created and the system responds as if the original request succeeded
* Scenario 3: Availability check
   * Given the channel manager sends a new booking
   * When the system processes it
   * Then the same availability and concurrency control used for direct bookings is applied

# Business Rules

* The OTA Booking ID is the idempotency key.
* OTA bookings follow the same booking phase as direct bookings (availability check, taxes).
* Every requisiton for or from the OTA will be treated as a mockup because at this moment, on a real business situation, the motel would need to be in contact with the OTA integration team.
* All OTA mockups will be correct.

# Definition of Done (DoD)

* [ ] Code reviewed via Pull Request
* [ ] Test coverage implemented
* [ ] Documentation and Wiki updated
