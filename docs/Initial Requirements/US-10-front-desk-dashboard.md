[US-10] Front Desk Dashboard
# User Story

As a Front Desk Agent, I want a fast, keyboard-friendly dashboard that flags missing requirements, So that I can process guests without overlooking mandatory steps.

# Acceptance Criteria

* Scenario 1: Viewing reservations
   * Given there are reservations to be handled
   * When I open the dashboard
   * Then the system displays them with their current state
* Scenario 2: Missing requirement flag
   * Given a reservation is missing its deposit hold or ID verification
   * When it is displayed on the dashboard
   * Then the missing requirement is clearly flagged
* Scenario 3: Keyboard navigation
   * Given I am on the dashboard
   * When I navigate and trigger actions using only the keyboard
   * Then every main action is reachable without the mouse

# Business Rules

* The dashboard must flag at least a missing deposit and a missing ID verification.
* The dashboard must be fast and keyboard-friendly.
* The system will process everything in 1.5 sec or lower.

# Definition of Done (DoD)

* [ ] Code reviewed via Pull Request
* [ ] Test coverage implemented
* [ ] Documentation and Wiki updated
