[US-03] Availability Search

# User Story

As a guest, I want to select my stay dates and see the available room types with their totals, So that I can choose a room before booking.

# Acceptance Criteria

* Scenario 1: Rooms available
   * Given I am on the public booking widget
   * When I select valid check-in and check-out dates and search
   * Then the system lists the room types available for every night of the stay, with the total amount including taxes in CAD
* Scenario 2: No availability
   * Given no room is available for the selected dates
   * When I search
   * Then the system informs me that no rooms are available for those dates
* Scenario 3: Bilingual experience
   * Given I am on the booking widget
   * When I select French (or English) as my language
   * Then all widget content is displayed in the selected language

# Business Rules

* The booking widget is bilingual (EN/FR).
* Availability is checked against the room type inventory, with concurrency control (see US-06).
* Amounts are in CAD and include localized taxes (see US-04).
* Check-in starts at 4:00 PM and check-out is strictly by 11:00 AM.
* The rate structure (e.g., by season, day of the week or length of stay) is not yet defined.
* The minimum stay is 1 day and the maximum stay is 5 days. The booking window is not yet defined.

# Definition of Done (DoD)

* [ ] Code reviewed via Pull Request
* [ ] Test coverage implemented
* [ ] Documentation and Wiki updated
