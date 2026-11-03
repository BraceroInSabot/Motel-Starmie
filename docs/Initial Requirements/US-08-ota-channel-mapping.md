[US-08] OTA Channel Mapping

# User Story

As a General Manager, I want to map each property's room types to OTA channel rooms, So that incoming OTA bookings are assigned to the correct property and room type.

# Acceptance Criteria

* Scenario 1: Creating a mapping
   * Given room types are registered for a property
   * When I map a room type to an OTA channel's room code
   * Then the system saves the mapping
* Scenario 2: Resolving an inbound booking
   * Given a room type is mapped to an OTA channel's room code
   * When a booking for that channel room code arrives (see US-07)
   * Then the system resolves it to the mapped property and room type
* Scenario 3: Channel room code already mapped
   * Given a channel room code is already mapped to a room type
   * When I try to map the same channel room code to another room type
   * Then the system blocks the mapping and informs me that the code is already in use
* Scenario 4: Unmapped channel room code
   * Given a channel room code is not mapped
   * When a booking for that code arrives
   * Then the system rejects the booking and logs the event for the General Manager

# Business Rules

* Real-time inventory distribution (sending availability and rates to the OTAs) is out of scope for V1, because the OTA integration is mocked (see US-07). Mappings are only used to resolve incoming bookings.
* Two mock channels come pre-loaded: "Booking.com (mock)" and "Expedia (mock)". The General Manager cannot add other channels in V1.
* A mapping links a room type of a property to a channel's room code. Rate plans are not mapped.
* Each property is a separate listing on each channel, with its own channel property code.
* A channel room code maps to exactly one room type. A room type can be mapped to several channels.
* An incoming booking for an unmapped channel room code is rejected and logged for the General Manager.
* Only the General Manager manages mappings, in the settings (see US-01). They can add, edit and remove mappings. Removing a mapping does not affect existing reservations.

# Definition of Done (DoD)

* [ ] Code reviewed via Pull Request
* [ ] Test coverage implemented
* [ ] Documentation and Wiki updated
