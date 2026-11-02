[US-19] Room State Machine and Cleaning Verification
# User Story

As a Head Housekeeper, I want room states to follow a strict state machine and to verify cleaned rooms, So that no guest is ever placed in an uncleaned room.

# Acceptance Criteria

* Scenario 1: Valid transition
   * Given a room is in a given state
   * When it moves to the next state allowed by the state machine
   * Then the system saves the new state
* Scenario 2: Invalid transition
   * Given a room is Dirty or Cleaning
   * When someone tries to check a guest into it
   * Then the system blocks the operation
* Scenario 3: Cleaning verification
   * Given a room is in Cleaning
   * When I verify that the cleaning is complete
   * Then the room changes to Available

Business Rules

* Room states: Available → Occupied (upon check-in) → Dirty (upon check-out) → Cleaning (in progress) → Available.
* Only the Head Housekeeper's verification moves a room from Cleaning to Available.
* A guest can only be checked into an Available room.
* Only a Head Housekeeper or a General Manager can moves a room from any state to Unavailable or Maintenance
* If the guest want the room to be clear during his stay, he will need to contact a housekeeper or General Manager. This type of user can move the status to dirty and then, when the housekeeper clean the room, he mark CLEANED and the state return to occupied.

Definition of Done (DoD)

* [ ] Code reviewed via Pull Request
* [ ] Test coverage implemented
* [ ] Documentation and Wiki updated
