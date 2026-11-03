[US-02] Property, Room Type and Room Registry

# User Story

As a General Manager, I want to register the motel's properties, their room types and the physical rooms of each type, So that inventory and availability reflect each property's real assets.

# Acceptance Criteria

* Scenario 1: Property registration
   * Given I am authenticated as a General Manager
   * When I register a property with its name, timezone, base currency, tax province and front desk hours
   * Then the system saves the property and makes it available for room type registration and in the booking widget
* Scenario 2: Room type registration
   * Given a property exists
   * When I register a room type (e.g., "Double Queen") for that property
   * Then the system saves it as a template of that property, available for room registration
* Scenario 3: Room registration
   * Given a room type exists
   * When I register a physical room (e.g., "Room 101") linked to that room type
   * Then the system saves the room as Available and counts it in that room type's inventory
* Scenario 4: Room without a room type
   * Given I am registering a room
   * When I try to save it without a room type
   * Then the system blocks the registration and informs me that the room type is mandatory
* Scenario 5: Duplicate room number in the same property
   * Given "Room 101" already exists at Bedford
   * When I register another "Room 101" at Bedford
   * Then the system blocks the registration and informs me that the room number is already in use at this property
* Scenario 6: Deactivating an occupied room
   * Given a guest is staying in a room
   * When I try to deactivate that room
   * Then the system blocks the deactivation and informs me that the room is occupied

# Business Rules

* The business operates two properties: Bedford (front desk open 24 hours) and Timberlea (front desk open from 8:00 AM to 12:00 AM). Both are in Nova Scotia, use the timezone America/Halifax and the currency CAD.
* The General Manager registers and edits properties. A property has a name, a timezone, a base currency, a tax province and front desk hours (either 24 hours, or an opening time and a closing time).
* RoomType is the template (e.g., "Double Queen"); Room is the physical asset (e.g., "Room 101").
* Every room type belongs to exactly one property, and every room belongs to exactly one room type. A room always belongs to the same property as its room type.
* There is no fixed number of rooms or room types: the General Manager registers as many as needed.
* A room type has: a name (EN and FR), a description (EN and FR, shown in the booking widget), a maximum number of guests, a bed configuration (e.g., "2 Queen beds"), amenities chosen from a predefined list (refrigerator, microwave, coffee maker, TV, Wi-Fi) and optional photos.
* A room has: a room number, a room type and an optional note (e.g., "ground floor, accessible").
* A newly registered room starts in the Available state.
* Room type names and room numbers must be unique within a property. The same name or number can exist in different properties.
* The General Manager can edit room types and rooms, and can deactivate them, but can never delete them. A room cannot be deactivated while a guest is staying in it, and a room type cannot be deactivated while it has active rooms.
* Deactivated rooms and room types are not offered for booking or check-in.

# Definition of Done (DoD)

* [ ] Code reviewed via Pull Request
* [ ] Test coverage implemented
* [ ] Documentation and Wiki updated
