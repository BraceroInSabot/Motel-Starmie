[US-05] Policy Acceptance Before Payment

# User Story

As a guest, I want to be clearly shown the property's policies and accept them before paying, So that I know the rules of my stay in advance.

# Acceptance Criteria

* Scenario 1: Policies displayed
   * Given I have selected a property, a room type and dates
   * When I proceed to payment
   * Then the system displays that property's Terms & Conditions (including Age 21+, No Pets, No Smoking/Cannabis and the cancellation and no-show fees) and requires my acceptance
* Scenario 2: Policies not accepted
   * Given the Terms & Conditions are displayed
   * When I do not accept them
   * Then the system does not allow me to proceed to payment
* Scenario 3: Policies in my language
   * Given I selected French (or English) as my language
   * When the Terms & Conditions are displayed
   * Then they are shown in the selected language
* Scenario 4: Terms changed during the booking
   * Given I am booking and have not yet accepted the Terms & Conditions
   * When the General Manager publishes a new version
   * Then the system shows me the new version and requires my acceptance of that version
* Scenario 5: Acceptance stored as evidence
   * Given I accept the Terms & Conditions
   * When my reservation is created
   * Then the system stores the timestamp, the version accepted, the language shown and the channel

# Business Rules

* Each property has its own Terms & Conditions, in EN and FR.
* The system comes with a default Terms & Conditions text (EN and FR) for each property, which the General Manager can edit in the settings.
* The Terms & Conditions include at least: Age 21+, No Pets, No Smoking/Cannabis, the check-in and check-out times, and the deposit.
* The Terms & Conditions page automatically shows the property's current cancellation and no-show fees, or "no fee", from the property's settings (see US-11), next to the General Manager's text.
* Every edit creates a new version. A guest who has not yet accepted must accept the latest version.
* Policies must be accepted before payment information is taken.
* Policies are displayed in EN or FR, according to the guest's choice.
* The acceptance is stored as evidence with: the timestamp, the Terms & Conditions version, the language shown and the channel (booking website or front desk). The IP address is not stored.
* Walk-ins (US-09): the Front Desk Agent shows the Terms & Conditions to the guest and records the acceptance on the guest's behalf. The record also stores which agent recorded it.
* OTA bookings (US-07) do not record a Terms & Conditions acceptance, because the guest accepts the OTA's own terms.

# Definition of Done (DoD)

* [ ] Code reviewed via Pull Request
* [ ] Test coverage implemented
* [ ] Documentation and Wiki updated
