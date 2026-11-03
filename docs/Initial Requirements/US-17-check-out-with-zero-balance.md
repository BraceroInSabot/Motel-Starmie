[US-17] Check-out with Zero Balance

# User Story

As a Front Desk Agent, I want to check out a guest only when the folio balance is zero, So that every stay is fully settled.

# Acceptance Criteria

* Scenario 1: Clean stay
   * Given the folio balance is $0.00
   * When I click "Check-out"
   * Then the deposit hold is released (or the cash deposit is returned), the reservation changes to Checked-Out, the room changes to Dirty and the final zero-balance invoice is emailed to the guest
* Scenario 2: Outstanding balance that cannot be settled
   * Given the folio balance is not $0.00 after the automatic settlement steps
   * When I try to check the guest out
   * Then the system blocks the check-out until the guest pays the remaining balance at the desk
* Scenario 3: Invoice language
   * Given the guest chose French (or English)
   * When the final invoice is emailed
   * Then it is in the guest's chosen language, as a PDF
* Scenario 4: Fine captured from the hold
   * Given a $250 fine is unpaid and a $300 deposit hold exists
   * When I click "Check-out"
   * Then the system captures $250 from the hold, releases the remaining $50 and completes the check-out
* Scenario 5: Early departure
   * Given a guest leaves 2 nights before the planned check-out date
   * When I check the guest out
   * Then the 2 unused prepaid nights are refunded automatically through Stripe
* Scenario 6: Stripe unavailable when releasing the hold
   * Given the check-out balance is $0.00
   * When Stripe is unavailable to release the hold
   * Then the check-out completes and the system retries the release automatically until Stripe confirms it

# Business Rules

* Check-out is strictly by 11:00 AM (the property's local time).
* A guest still In-House after 11:00 AM on the departure day is flagged as a late check-out on the dashboard (see US-10). No fee is charged, and staff can still check the guest out normally.
* When "Check-out" is clicked, the system follows these steps in order:
   1. Capture any unpaid fines from the card hold, or deduct them from the cash deposit (see US-16).
   2. Charge any remaining balance to the card kept by Stripe (see US-06).
   3. Refund unused prepaid nights if the guest leaves early (see US-11).
   4. Check that the folio balance is $0.00.
   5. Release whatever is left of the card hold, or return the rest of the cash deposit in cash (see US-13).
   6. Change the reservation to Checked-Out and the room to Dirty.
   7. Email the final invoice.
* The folio balance must be $0.00 to complete a check-out.
* Guests with no card on file (OTA guests and cash walk-ins) pay any remaining balance at the desk, by card in Stripe's secure fields or in cash, before the check-out can be completed.
* When only part of the hold is captured, the rest of the hold is released automatically.
* On a clean stay, the whole deposit hold is released through Stripe.
* If Stripe is unavailable when releasing the hold, the check-out still completes and the release is retried automatically until Stripe confirms it.
* The final invoice:
   * Is numbered sequentially for each property.
   * Contains the property details, the guest's name, the stay dates, each nightly charge, each tax on its own line, fines, payments, refunds and the final $0.00 balance.
   * Is emailed as a PDF in the guest's chosen language.
* Front Desk Agents and the General Manager can check guests out. Guest self check-out is out of scope for V1.

# Definition of Done (DoD)

* [ ] Code reviewed via Pull Request
* [ ] Test coverage implemented
* [ ] Documentation and Wiki updated
