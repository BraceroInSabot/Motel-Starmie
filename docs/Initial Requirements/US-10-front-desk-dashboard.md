[US-10] Front Desk Dashboard

# User Story

As a Front Desk Agent, I want a fast, keyboard-friendly dashboard that flags missing requirements, So that I can process guests without overlooking mandatory steps.

# Acceptance Criteria

* Scenario 1: Viewing reservations
   * Given there are reservations to be handled today at my property
   * When I open the dashboard
   * Then the system displays the Arrivals, In-House, Departures and bookings waiting for confirmation, each with its current state, and the open violation reports
* Scenario 2: Missing requirement flag
   * Given a reservation is missing its deposit or ID verification
   * When it is displayed on the dashboard
   * Then the missing requirement is clearly flagged
* Scenario 3: Late check-out flag
   * Given a guest is still In-House after 11:00 AM on the departure day
   * When the dashboard is displayed
   * Then the reservation is flagged as a late check-out
* Scenario 4: Keyboard navigation
   * Given I am on the dashboard
   * When I navigate and trigger actions using only the keyboard
   * Then every main action is reachable without the mouse
* Scenario 5: Automatic refresh
   * Given the dashboard is open
   * When 60 seconds have passed since the last refresh
   * Then the dashboard reloads its data automatically

# Business Rules

* The dashboard shows, for the agent's property and the current day (the property's local date):
   * Arrivals: reservations with check-in today.
   * In-House: reservations currently In-House.
   * Departures: reservations with check-out today.
   * Bookings waiting for confirmation: Unconfirmed reservations (see US-06).
   * Open violation reports sent by housekeeping (see US-16).
* The dashboard flags these requirements on each reservation:
   * Missing deposit: no authorized card hold and no cash deposit (see US-13).
   * Missing ID verification (see US-12).
   * Early check-in approval needed: arrival before 4:00 PM without an approval (see US-12).
   * Booking still Unconfirmed (see US-06).
   * Outstanding balance on a departure: the check-out will be blocked (see US-17).
   * Late check-out: still In-House after 11:00 AM on the departure day.
* The dashboard refreshes automatically every 60 seconds, and the agent can refresh it with a key.
* Keyboard shortcuts: Up and Down arrows move between rows, Enter opens the selected reservation, C starts check-in, / focuses the search, R refreshes and Esc goes back.
* The agent can search by guest name, confirmation code or room number.
* A Front Desk Agent sees only their own property. The General Manager chooses which property to view.
* The dashboard must be fast and keyboard-friendly.
* Every API request in the system must respond in 1.5 seconds or less for 95% of requests. Exports (PDF and CSV) and calls to external services (Stripe, email) are excluded from this rule.

# Definition of Done (DoD)

* [ ] Code reviewed via Pull Request
* [ ] Test coverage implemented
* [ ] Documentation and Wiki updated
