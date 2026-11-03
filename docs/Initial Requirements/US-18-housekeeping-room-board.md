[US-18] Housekeeping Room Board

# User Story

As a Housekeeper, I want a real-time mobile list of rooms grouped by status, So that I know which rooms to clean and can update their state instantly.

# Acceptance Criteria

* Scenario 1: Rooms grouped by status
   * Given I am authenticated as a Housekeeper on a mobile or tablet device
   * When I open the room board
   * Then the system lists the rooms of my property grouped by Checkout/Dirty, Stayover, Clean and Out of service, sorted by room number
* Scenario 2: Instant update
   * Given I am on the room board
   * When I update a room's state
   * Then the change is reflected in real time for all users, including the front desk dashboard
* Scenario 3: No financial data
   * Given I am on the room board
   * When I view any room
   * Then no financial data and no guest names are displayed
* Scenario 4: Stayover cleaning requested
   * Given a guest who is still In-House asked for their room to be cleaned
   * When the room is moved to Dirty (see US-19)
   * Then the room stays in the Stayover group with a "cleaning requested" badge

# Business Rules

* The interface must work on mobile and tablet devices.
* The room list is real-time: changes are pushed instantly using WebSockets (Django Channels), with RabbitMQ as the message layer.
* Room states map to board groups as follows:
   * Available → Clean.
   * Occupied → Stayover.
   * Dirty with a guest still In-House → Stayover, with a "cleaning requested" badge.
   * Dirty after check-out → Checkout/Dirty.
   * Cleaning → Checkout/Dirty.
   * Unavailable and Maintenance → Out of service.
* Everyone with access to the board sees the Out of service group, but only a Head Housekeeper or the General Manager can act on those rooms (see US-19).
* Each room card shows the room number, the room type, the state, the "cleaning requested" badge when relevant, the room's note (see US-02) and the actions the user is allowed to take.
* Housekeepers see no financial data and no guest names.
* A Housekeeper sees the rooms of their own property. The General Manager chooses which property to view. Rooms are sorted by room number within each group.
* Room state changes are also pushed live to the front desk dashboard (see US-10).

# Definition of Done (DoD)

* [ ] Code reviewed via Pull Request
* [ ] Test coverage implemented
* [ ] Documentation and Wiki updated
