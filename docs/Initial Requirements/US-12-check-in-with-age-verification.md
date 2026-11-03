[US-12] Check-in with Age Verification

# User Story

As a Front Desk Agent, I want to verify the guest's government ID at check-in, So that the Age 21+ policy is enforced.

# Acceptance Criteria

* Scenario 1: Guest aged 21 or older
   * Given I pulled up the guest's reservation
   * When I verify the government ID and the date of birth shows that the guest is 21 or older
   * Then the system allows the check-in to proceed
* Scenario 2: Guest under 21
   * Given I pulled up the guest's reservation
   * When the date of birth on the ID shows that the guest is under 21
   * Then the system blocks the check-in
* Scenario 3: Management override
   * Given a check-in was blocked because the guest is under 21
   * When the General Manager approves the override with a justification from their own login
   * Then the system records the override in the audit log and allows the check-in to proceed
* Scenario 4: Override without a justification
   * Given a check-in was blocked because the guest is under 21
   * When the General Manager tries to approve the override without a justification
   * Then the system blocks the override and asks for a justification
* Scenario 5: Early check-in
   * Given a guest arrives before 4:00 PM and an Available room of the booked room type exists
   * When I approve the early check-in
   * Then the system records my approval and allows the check-in to proceed, without any fee

# Business Rules

* Check-in starts at 4:00 PM (the property's local time).
* Only the guest who registers and holds the reservation must show a government ID.
* Accepted ID types: driver's licence, passport, or provincial or territorial photo ID card.
* Age is calculated from the date of birth on the ID, against the property's local date of check-in.
* Under 21: the check-in is blocked unless the General Manager performs a hard override (see US-01).
* The General Manager approves the override from their own login, on any device, by opening the blocked check-in, entering the justification and approving it. The agent's screen updates once it is approved.
* The override requires a justification (free text, required and not empty) and an audit record that stores the justification, who approved the override and when.
* If a guest under 21 cannot check in and no override is approved, staff cancel the reservation at the guest's request (the guest broke the Age 21+ policy they accepted), so the property's cancellation fee rules apply (see US-11).
* If a guest requests an early check-in, a Front Desk Agent can approve it. There is no fee, and it can be approved at any time the front desk is open, as long as an Available room of the booked room type exists.
* No ID data is stored. The system stores only the verification result, the ID type and the Front Desk Agent who performed the verification.

# Definition of Done (DoD)

* [ ] Code reviewed via Pull Request
* [ ] Test coverage implemented
* [ ] Documentation and Wiki updated
