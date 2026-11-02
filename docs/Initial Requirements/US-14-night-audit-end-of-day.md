[US-14] Night Audit (End of Day)

# User Story

As a Night Auditor, I want the End of Day process to post the nightly room rate and taxes to every in-house reservation, So that all folios are kept up to date.

# Acceptance Criteria

* Scenario 1: Automated posting
   * Given there are In-House reservations
   * When the Night Audit runs at the scheduled cutoff time
   * Then the system posts the nightly room rate and the applicable daily taxes to each reservation's folio
* Scenario 2: Timezone-aware schedule
   * Given the cutoff is configured in the property's local time
   * When daylight saving time begins or ends
   * Then the Night Audit still runs at the configured local time (America/Halifax)
* Scenario 3: Audit report available
   * Given the Night Audit has finished
   * When the General Manager opens the reports
   * Then the Night Audit report for that business day is available (see US-22)

# Business Rules

* The Night Audit iterates through all In-House reservations.
* The scheduled job (cron) must be timezone-aware; timestamps are stored in UTC.
* The cutoff time is 2:00 AM (property local time).
* If the Night Audit fails, it must write the error to a log file and send a warning email to the developer (guibragon@gmail.com).
* The no-show process starts at 1:00 AM.

# Definition of Done (DoD)

* [ ] Code reviewed via Pull Request
* [ ] Test coverage implemented
* [ ] Documentation and Wiki updated
