[US-17] Check-out with Zero Balance
# User Story

As a Front Desk Agent, I want to check out a guest only when the folio balance is zero, So that every stay is fully settled.

# Acceptance Criteria

* Scenario 1: Clean stay
   * Given the folio balance is $0.00
   * When I click "Check-out"
   * Then the hold is released, the reservation changes to Checked-Out, the room changes to Dirty and the final zero-balance invoice is emailed to the guest
* Scenario 2: Outstanding balance
   * Given the folio balance is not $0.00
   * When I try to check the guest out
   * Then the system blocks the check-out
* Scenario 3: Invoice language
   * Given the guest chose French (or English)
   * When the final invoice is emailed
   * Then it is in the guest's chosen language

# Business Rules

* Check-out is strictly by 11:00 AM.
* The folio balance must be $0.00 to complete a check-out.
* On a clean stay, the $250 CAD hold is released via the payment gateway.

# Definition of Done (DoD)

* [ ] Code reviewed via Pull Request
* [ ] Test coverage implemented
* [ ] Documentation and Wiki updated
