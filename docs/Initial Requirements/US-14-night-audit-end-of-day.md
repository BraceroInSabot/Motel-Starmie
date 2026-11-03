[US-14] Night Audit (End of Day)

# User Story

As a General Manager, I want the system to post the nightly room rate and taxes to every In-House reservation automatically, So that all folios are kept up to date.

# Acceptance Criteria

* Scenario 1: Automated posting
   * Given there are In-House reservations at a property
   * When the Night Audit runs at 2:00 AM on November 2 (the property's local time)
   * Then the system posts the room rate and the applicable taxes for the night of November 1 to each reservation's folio
* Scenario 2: Timezone-aware schedule
   * Given the cutoff is 2:00 AM in the property's local time (America/Halifax)
   * When daylight saving time begins (2:00 AM does not exist) or ends (one hour repeats)
   * Then the Night Audit runs at the first moment after 2:00 AM (3:00 AM) when the clocks spring forward, and runs only once when they fall back
* Scenario 3: No night charged twice
   * Given the night of November 1 has already been charged for a reservation
   * When the Night Audit runs again
   * Then that night is not charged again
* Scenario 4: Missed night caught up
   * Given a guest checked in at 3:00 AM, after the Night Audit had run
   * When the next Night Audit runs
   * Then every night of the stay that has not been charged yet, up to the day being closed, is charged
* Scenario 5: One reservation fails
   * Given a reservation cannot be charged (e.g., no rate is found)
   * When the Night Audit runs
   * Then that reservation is added to the exceptions list (see US-22) and the other reservations are still charged
* Scenario 6: Audit report available
   * Given the Night Audit has finished
   * When the General Manager opens the reports
   * Then the Night Audit report for that business day is available (see US-22)

# Business Rules

* The Night Audit is an automated system process (see US-01). It runs separately for each property.
* The cutoff time is fixed at 2:00 AM in the property's local time, for both properties.
* The 2:00 AM run closes the previous local date: the night the guests stayed (e.g., the run on November 2 closes November 1).
* The Night Audit iterates through all In-House reservations and posts the room rate and the applicable taxes (see US-03 and US-04) for the night being closed.
* Each night is charged only once per reservation. Repeated runs skip nights that have already been charged.
* Any night of the stay that has not been charged yet, up to the day being closed, is charged at the next run.
* The payment taken at booking (US-06) stays in the folio as a credit, and the nightly charges are posted against it. At check-out the balance reaches zero unless fines were added.
* The scheduled job (cron) is timezone-aware, and timestamps are stored in UTC.
* Daylight saving time: when the clocks spring forward, the run happens at the first moment after 2:00 AM (3:00 AM). When the clocks fall back, it runs only once.
* If one reservation cannot be charged, it is added to the exceptions list (see US-22) and the run continues with the others.
* If the whole run fails, it is retried automatically every 15 minutes, up to 3 times. If it still fails, a warning email is sent to the developer.
* Errors are written to the application logs, and the result of every run is stored in the database.
* The developer's email address is set in the configuration (an environment variable). The default is guibragon@gmail.com.
* No-show processing is not part of the Night Audit (see US-11).

# Definition of Done (DoD)

* [ ] Code reviewed via Pull Request
* [ ] Test coverage implemented
* [ ] Documentation and Wiki updated
