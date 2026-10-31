[US-02] Room Type and Room Registry
User Story
As a General Manager, I want to register room types and the physical rooms of each type, So that inventory and availability reflect the property's real assets.
Acceptance Criteria

* Scenario 1: Room type registration
   * Given I am authenticated as a General Manager
   * When I register a room type (e.g., "Double Queen")
   * Then the system saves it as a template available for room registration
* Scenario 2: Room registration
   * Given a room type exists
   * When I register a physical room (e.g., "Room 101") linked to that room type
   * Then the system saves the room and counts it in that room type's inventory
* Scenario 3: Room without a room type
   * Given I am registering a room
   * When I try to save it without a room type
   * Then the system blocks the registration and informs that the room type is mandatory

Business Rules

* RoomType is the template (e.g., "Double Queen"); Room is the physical asset (e.g., "Room 101").
* Every Room belongs to exactly one RoomType.
* The Property represents the motel: base currency CAD, local timezone America/Halifax.
* Number of rooms and list of room types.

Definition of Done (DoD)

* [ ] Code reviewed via Pull Request
* [ ] Test coverage implemented
* [ ] Documentation and Wiki updated
