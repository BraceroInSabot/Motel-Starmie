[US-03] Availability Search

# User Story

As a guest, I want to select a property, my stay dates and the number of guests and see the available room types with their totals, So that I can choose a room before booking.

# Acceptance Criteria

* Scenario 1: Rooms available
   * Given I am on the public booking widget
   * When I select a property, valid check-in and check-out dates and the number of guests, and search
   * Then the system lists the room types of that property that are available for every night of the stay and fit the number of guests, with the price of each night, the taxes and the total amount in CAD
* Scenario 2: No availability
   * Given no room is available for the selected dates
   * When I search
   * Then the system informs me that no rooms are available for those dates
* Scenario 3: Bilingual experience
   * Given I am on the booking widget
   * When I select French (or English) as my language
   * Then all widget content is displayed in the selected language
* Scenario 4: Stay longer than the maximum
   * Given I am on the booking widget
   * When I select a stay of more than 5 nights
   * Then the system does not search and informs me that the maximum stay is 5 nights
* Scenario 5: Weekend rate
   * Given the "Double Queen" room type has a base rate of $100 and a weekend rate of $130
   * When I search for a stay from Thursday to Sunday
   * Then the system prices Thursday night at $100, and Friday and Saturday nights at $130 each, before taxes
* Scenario 6: Not enough capacity
   * Given a room type has a maximum of 2 guests
   * When I search for 3 guests
   * Then that room type is not listed

# Business Rules

* The guest first selects the property (Bedford or Timberlea), then the dates and the number of guests. Results show only that property's room types.
* The booking widget is bilingual (EN/FR).
* Availability is checked against the room type inventory, with concurrency control (see US-06).
* Only room types whose maximum number of guests is equal to or greater than the requested number of guests are listed.
* Each room type has a nightly base rate and an optional weekend rate for Friday and Saturday nights. The General Manager sets both.
* The price of a Friday or Saturday night is the weekend rate, if one is set. The price of every other night is the base rate.
* Rates do not include taxes. Taxes are calculated separately (see US-04).
* Amounts are in CAD.
* Check-in starts at 4:00 PM and check-out is strictly by 11:00 AM.
* Stays are counted in nights. The minimum stay is 1 night and the maximum stay is 5 nights.
* Guests can book from the current day (same-day bookings) up to 365 days ahead. Days are counted in the property's local timezone.
* Each result shows the room type name, description, photos and amenities, the price of each night, the taxes (shown separately) and the total in CAD.
* Deactivated rooms and rooms in the Unavailable or Maintenance state are not offered for any night until they return to service.

# Definition of Done (DoD)

* [ ] Code reviewed via Pull Request
* [ ] Test coverage implemented
* [ ] Documentation and Wiki updated
