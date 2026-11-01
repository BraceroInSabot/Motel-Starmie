[US-09] Walk-in Reservation
# User Story

As a Front Desk Agent, I want to create a reservation for a walk-in guest, So that I can sell available rooms at the desk quickly.

# Acceptance Criteria

* Scenario 1: Successful walk-in reservation
   * Given there is availability for the requested dates
   * When I create a reservation with the guest's data and stay dates
   * Then the system creates the reservation with localized taxes applied
* Scenario 2: No availability
   * Given there is no availability for the requested dates
   * When I try to create the reservation
   * Then the system informs that there are no rooms available
* Scenario 3: Keyboard-only operation
   * Given I am on the walk-in reservation form
   * When I complete it using only the keyboard
   * Then I can fill in and submit every field without using the mouse

# Business Rules

* Walk-ins follow the same availability, concurrency and tax rules as other bookings.
* The front desk interface must be fast and keyboard-friendly.
* Walk-ins should go through the same T&C acceptance and card tokenization steps.
* When a guest pays in cash, the employee confirms it by confirming the booking.

# Definition of Done (DoD)

* [ ] Code reviewed via Pull Request
* [ ] Test coverage implemented
* [ ] Documentation and Wiki updated
