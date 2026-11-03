[US-07] OTA Booking Ingestion via Channel Manager Webhook

# User Story

As a General Manager, I want bookings pushed by the channel manager to be created exactly once, So that repeated webhooks never cause duplicate reservations or overbooking.

# Acceptance Criteria

* Scenario 1: New OTA booking
   * Given the mock OTA simulator sends a signed booking webhook with an OTA Booking ID not yet received
   * When the system processes the webhook
   * Then a Confirmed reservation is created, linked to that OTA Booking ID, with localized taxes applied and the amount recorded as an "OTA prepaid" payment in the folio
* Scenario 2: Duplicate webhook
   * Given a reservation already exists for an OTA Booking ID
   * When the same booking is sent again
   * Then no new reservation is created and the system responds as if the original request succeeded
* Scenario 3: Availability check
   * Given a new OTA booking is sent
   * When the system processes it
   * Then the same availability and concurrency control used for direct bookings is applied
* Scenario 4: No availability
   * Given no room of the requested room type is available for the dates
   * When an OTA booking for those dates is sent
   * Then nothing is created, an error is returned to the simulator and the event is logged for the General Manager
* Scenario 5: Invalid signature
   * Given a webhook is not signed with the shared secret
   * When the system receives it
   * Then the system rejects it and creates nothing

# Business Rules

* The OTA Booking ID is the idempotency key.
* OTA bookings follow the same booking phase as direct bookings (availability check, taxes).
* All requests to and from the OTA are mocked, because a real integration would require the motel to work directly with the OTA's integration team.
* A mock OTA simulator (a command, plus a simple screen in the development environment) sends fake booking webhooks to the real webhook endpoint, so the real ingestion code is used and a real channel manager can replace the simulator later.
* A mock booking contains: channel code, OTA Booking ID, property code, channel room code, check-in date, check-out date, number of guests, guest full name, email, phone, language (EN/FR) and amount paid at the OTA.
* All mocked OTA data is assumed to be valid. The amount paid at the OTA equals the total calculated by the system.
* Every webhook is signed with a shared secret (HMAC), and the system rejects webhooks with an invalid signature, including in the mock.
* OTA guests pay the OTA. The system does not charge them through Stripe, and records the amount as an "OTA prepaid" payment in the folio (see US-15).
* OTA bookings start as Confirmed.
* If no room is available, the booking is rejected: nothing is created, an error is returned to the simulator and the event is logged for the General Manager.
* Only new bookings are supported. Modifications and cancellations sent by the OTA are out of scope for V1.
* PIPEDA consent for OTA guests is considered given through the OTA's terms and is recorded with the source "OTA" (see US-20).
* The system sends no email to OTA guests, because the OTA sends its own confirmation.

# Definition of Done (DoD)

* [ ] Code reviewed via Pull Request
* [ ] Test coverage implemented
* [ ] Documentation and Wiki updated
