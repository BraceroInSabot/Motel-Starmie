[US-08] OTA Channel Mapping
# User Story

As a General Manager, I want to map the property's room types to OTA channels, So that inventory is distributed correctly across channels.

# Acceptance Criteria

* Scenario 1: Creating a mapping
   * Given room types are registered
   * When I map a room type to an OTA channel's room
   * Then the system saves the mapping
* Scenario 2: Resolving an inbound booking
   * Given a room type is mapped to an OTA channel's room
   * When a booking for that channel room arrives
   * Then the system resolves it to the mapped room type

# Business Rules

* The system handles real-time inventory distribution.

# Definition of Done (DoD)

* [ ] Code reviewed via Pull Request
* [ ] Test coverage implemented
* [ ] Documentation and Wiki updated
