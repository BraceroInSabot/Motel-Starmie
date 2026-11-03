[US-16] Policy Violation Fine

# User Story

As a Front Desk Agent, I want to add a fine to the folio when housekeeping reports a policy violation, So that the cost of the violation is charged to the guest.

# Acceptance Criteria

* Scenario 1: Housekeeper reports a violation
   * Given I am a Housekeeper logged in to the system
   * When I report smoke in a room and attach 1 to 5 photos as evidence
   * Then the system saves the report and shows it to the front desk as an open violation report
* Scenario 2: Fine posted
   * Given housekeeping reported smoke in a guest's room
   * When I review the report and add a "$250 Cannabis Cleaning Fine" to the folio
   * Then the system posts the fine as a charge on the folio, links it to the report, and emails the guest about the fine in their language
* Scenario 3: Report dismissed
   * Given an open violation report
   * When I dismiss it and enter a reason
   * Then no fine is posted and the report is closed
* Scenario 4: Fine settled from the hold at check-out
   * Given a fine was posted and a pre-authorization hold exists
   * When the guest checks out
   * Then the system captures the unpaid balance from the pre-authorized hold
* Scenario 5: Balance larger than the hold
   * Given the unpaid balance is larger than the hold
   * When the guest checks out
   * Then the system captures the whole hold and charges the rest to the card kept by Stripe; if that charge is declined, the balance stays open and the check-out is blocked until the guest pays at the desk
* Scenario 6: Violation found after check-out
   * Given a guest checked out less than 7 days ago
   * When the General Manager posts a fine for that stay
   * Then the system charges it to the card kept by Stripe and emails the guest a notice
* Scenario 7: Violation found after check-out, no card kept
   * Given a guest who paid in cash and left a cash deposit checked out less than 7 days ago
   * When the General Manager tries to post a fine for that stay
   * Then the system blocks it and informs the General Manager that the guest has no card kept by Stripe

# Business Rules

* The Cannabis Cleaning Fine is $250 CAD by default. The General Manager can change this amount in the settings.
* Other fine types (e.g., pets, damages) and their amounts are defined by the General Manager.
* The system must have a settings page where the General Manager can add, edit and remove fines and their amounts. This is a simple settings page, so it does not need a separate user story.
* Fines are defined for each property. Removing a fine type deactivates it instead of deleting it, so past charges keep their history.
* Fines are not taxed (see US-04).
* The Housekeeper logs in to the system and reports the occurrence with evidence: photos only (JPG, PNG or HEIC), at least 1 and at most 5 per report, up to 10 MB each.
* Evidence is kept until the General Manager deletes it.
* A Front Desk Agent reviews each report and its evidence, then either posts the fine linked to the report or dismisses the report with a reason. A report can never be fined twice.
* When a fine is posted, the guest receives an email in their language with the fine name and amount. The email does not include the photos.
* Fines are collected at check-out: the unpaid balance is captured from the pre-authorized hold, or deducted from the cash deposit (see US-13).
* If the unpaid balance is larger than the hold or the cash deposit, the whole hold or deposit is used, and the rest is charged automatically to the card kept by Stripe (see US-06). If that charge is declined, the balance stays open and the check-out is blocked (see US-17) until the guest pays at the desk by card or in cash.
* After check-out, the General Manager can still post a fine for a stay within 7 days of the check-out. It is charged to the card kept by Stripe (the card from booking, see US-06, or the card entered at check-in, see US-13), and the guest receives an email notice.
* Guests with no card kept by Stripe (e.g., they paid in cash and left a cash deposit) cannot receive a fine after check-out.

# Definition of Done (DoD)

* [ ] Code reviewed via Pull Request
* [ ] Test coverage implemented
* [ ] Documentation and Wiki updated
