[US-12] Check-in with Age Verification
# User Story

As a Front Desk Agent, I want to verify the guest's government ID at check-in, So that the Age 21+ policy is enforced.

# Acceptance Criteria

* Scenario 1: Guest aged 21 or older
   * Given I pulled up the guest's reservation
   * When I verify the government ID and the date of birth results in age 21 or older
   * Then the system allows the check-in to proceed
* Scenario 2: Guest under 21
   * Given I pulled up the guest's reservation
   * When the date of birth on the ID results in age under 21
   * Then the system blocks the check-in
* Scenario 3: Management override
   * Given a check-in was blocked because the guest is under 21
   * When a manager performs a hard override
   * Then the system allows the check-in to proceed

# Business Rules

* Check-in starts at 4:00 PM.
* Age is calculated from the date of birth on a government ID.
* Under 21: the check-in is blocked unless management performs a hard override.
* If a guest did a early check-in, the front-desk employee can approve.
* No ID's are stored. Only the confirmation, the id type and the Front Desk Agent who verified.
* The override requires a justification and an audit record.

# Definition of Done (DoD)

* [ ] Code reviewed via Pull Request
* [ ] Test coverage implemented
* [ ] Documentation and Wiki updated
