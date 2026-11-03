[US-23] Occupancy Reporting

# User Story

As a General Manager, I want to see occupancy rates per period, So that I can manage the property's yield.

# Acceptance Criteria

* Scenario 1: Occupancy rate
   * Given there are stays recorded in a period
   * When I generate the occupancy report for that period
   * Then the system displays the occupancy rate, the ADR and the RevPAR for the period, with a daily breakdown and a breakdown by room type
* Scenario 2: Calculation example
   * Given a property has 20 active rooms, 2 of them in Maintenance at the night audit, and 9 room-nights charged for $900.00 of room revenue on that night
   * When I generate the occupancy report for that night
   * Then the system shows 18 available room-nights, an occupancy of 50.0%, an ADR of $100.00 and a RevPAR of $50.00
* Scenario 3: No-Show and Canceled reservations
   * Given a night has No-Show and Canceled reservations
   * When I generate the occupancy report
   * Then those reservations are not counted as occupied room-nights
* Scenario 4: Export
   * Given I am viewing the occupancy report
   * When I export it as PDF or CSV
   * Then the system downloads the report with the same content and header

# Business Rules

* Occupancy (%) = occupied room-nights ÷ available room-nights × 100, rounded to 1 decimal place.
* Available room-nights, for each night: the property's active rooms, minus the rooms that were Unavailable or Maintenance at the 2:00 AM Night Audit (taken from the room state history, see US-19).
* Occupied room-nights: the nights actually charged by the Night Audit (see US-14), excluding voided charges. No-Show and Canceled reservations are not counted.
* ADR (average daily rate) = room revenue ÷ occupied room-nights.
* RevPAR (revenue per available room) = room revenue ÷ available room-nights.
* Room revenue excludes taxes. ADR and RevPAR are in CAD and rounded to the cent, with halves rounded up.
* When a value has no room-nights to divide by, the report shows "N/A" instead of a number.
* The General Manager can choose any date range. The report shows the period totals, a daily breakdown and a breakdown by room type.
* Dynamic pricing is out of scope: this is a report only, and prices stay as set by the General Manager (see US-03).
* Only the General Manager can view the report. It is generated for one property at a time, with the same header and PDF and CSV export as the other reports (see US-22).

# Definition of Done (DoD)

* [ ] Code reviewed via Pull Request
* [ ] Test coverage implemented
* [ ] Documentation and Wiki updated
