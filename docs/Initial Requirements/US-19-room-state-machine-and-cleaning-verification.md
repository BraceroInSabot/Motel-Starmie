[US-19] Room State Machine and Cleaning Verification

# User Story

As a Head Housekeeper, I want room states to follow a strict state machine and to verify cleaned rooms, So that no guest is ever placed in an uncleaned room.

# Acceptance Criteria

* Scenario 1: Valid transition
   * Given a room is in a given state
   * When it moves to the next state allowed by the state machine
   * Then the system saves the new state and records who made the change and when
* Scenario 2: Invalid transition
   * Given a room is Dirty, Cleaning, Unavailable or Maintenance
   * When someone tries to check a guest into it
   * Then the system blocks the operation
* Scenario 3: Cleaning verification
   * Given a room is in Cleaning
   * When I verify that the cleaning is complete
   * Then the room changes to Available
* Scenario 4: Stayover cleaning
   * Given a guest who is In-House asks for their room to be cleaned
   * When a Housekeeper, the General Manager or a Front Desk Agent records the request, and a Housekeeper later marks the room as CLEANED
   * Then the room changes from Occupied to Dirty, and then back to Occupied
* Scenario 5: Taking a room out of service
   * Given a room has no guest In-House
   * When a Head Housekeeper or the General Manager moves it to Maintenance and enters a reason
   * Then the room changes to Maintenance and cannot receive check-ins
* Scenario 6: Out of service blocked while a guest is In-House
   * Given a guest is In-House in a room
   * When someone tries to move that room to Unavailable or Maintenance
   * Then the system blocks the change
* Scenario 7: Returning a room to service
   * Given a room is in Unavailable or Maintenance
   * When a Head Housekeeper or the General Manager returns it to service
   * Then the room changes to Dirty and must be cleaned and verified before the next guest

# Business Rules

* Room states: Available, Occupied, Dirty, Cleaning, Unavailable and Maintenance.
* Allowed transitions (any other transition is blocked):

| From | To | Triggered by |
|---|---|---|
| Available | Occupied | Check-in (see US-13) |
| Occupied | Dirty | Check-out (see US-17) |
| Occupied | Dirty | Stayover cleaning request: Housekeeper, General Manager or Front Desk Agent |
| Dirty (guest still In-House) | Occupied | Housekeeper marks the room as CLEANED |
| Dirty (after check-out) | Cleaning | Any Housekeeper starts cleaning |
| Cleaning | Available | Head Housekeeper verification |
| Available, Dirty (after check-out) or Cleaning | Unavailable or Maintenance | Head Housekeeper or General Manager, with a reason |
| Unavailable or Maintenance | Dirty | Head Housekeeper or General Manager returns the room to service |

* Only the Head Housekeeper's verification moves a room from Cleaning to Available. A Head Housekeeper may verify a room they cleaned themselves.
* A guest can only be checked into an Available room.
* Maintenance is used for repairs (e.g., heating, plumbing, broken furniture). Unavailable is used for any other reason (e.g., blocked by the manager, renovation, staff use).
* Only a Head Housekeeper or the General Manager can move a room to Unavailable or Maintenance, and a reason (a short text) is required.
* A room cannot be moved to Unavailable or Maintenance while a guest is In-House.
* A room returning from Unavailable or Maintenance goes to Dirty, so it must be cleaned and verified before the next guest.
* If a guest wants the room cleaned during their stay, they ask a Housekeeper, the General Manager or a Front Desk Agent, who moves the room to Dirty. After cleaning the room, a Housekeeper marks it as CLEANED and the room returns to Occupied.
* Every room state change is recorded with who made it and when.

# Definition of Done (DoD)

* [ ] Code reviewed via Pull Request
* [ ] Test coverage implemented
* [ ] Documentation and Wiki updated
