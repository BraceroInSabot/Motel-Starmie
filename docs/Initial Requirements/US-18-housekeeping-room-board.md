[US-18] Housekeeping Room Board
# User Story

As a Housekeeper, I want a real-time mobile list of rooms grouped by status, So that I know which rooms to clean and can update their state instantly.

# Acceptance Criteria

* Scenario 1: Rooms grouped by status
   * Given I am authenticated as a Housekeeper on a mobile or tablet device
   * When I open the room board
   * Then the system lists the rooms grouped by Checkout/Dirty, Stayover and Clean
* Scenario 2: Instant update
   * Given I am on the room board
   * When I update a room's state
   * Then the change is reflected in real time for all users, including the front desk
* Scenario 3: No financial data
   * Given I am on the room board
   * When I view any room
   * Then no financial data is displayed

# Business Rules

* The interface must work on mobile and tablet devices.
* The room list is real-time.
* Housekeepers see no financial data.
* Room states and equivalency groups: Available (Clean); Occupied (Stayover); Dirty (Checkout/Dirty); Cleaning (Checkout/Dirty)

# Definition of Done (DoD)

* [ ] Code reviewed via Pull Request
* [ ] Test coverage implemented
* [ ] Documentation and Wiki updated
