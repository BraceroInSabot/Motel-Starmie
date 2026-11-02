[US-16] Policy Violation Fine
# User Story

As a Front Desk Agent, I want to add a fine to the folio when housekeeping reports a policy violation, So that the cost of the violation is charged to the guest.

# Acceptance Criteria

* Scenario 1: Fine posted
   * Given housekeeping reported smoke in a guest's room
   * When I add a "$250 Cannabis Cleaning Fine" to the folio
   * Then the system posts the fine as a charge on the folio
* Scenario 2: Fine settled from the hold
   * Given a fine was posted and a pre-authorization hold exists
   * When the system settles the balance
   * Then the funds are captured from the pre-authorized hold

# Business Rules

* The Cannabis Cleaning Fine is $250 CAD. And can me mutable by General Manager at configs.
* Fines are settled by capturing funds from the pre-authorized hold.
* Other fine types (e.g., pets, damages) and their amounts.
* The housekeeper will log in into the system and report the ocorrence with evidences.
* The system must have a page in configs where General Manager can add, edit and remove fines with it's values. No complexity added to description, so no new issue about the case.

# Definition of Done (DoD)

* [ ] Code reviewed via Pull Request
* [ ] Test coverage implemented
* [ ] Documentation and Wiki updated
