[US-05] Policy Acceptance Before Payment
# User Story

As a guest, I want to be clearly shown the property's policies and accept them before paying, So that I know the rules of my stay in advance.

# Acceptance Criteria

* Scenario 1: Policies displayed
   * Given I have selected a room type and dates
   * When I proceed to payment
   * Then the system displays the Terms & Conditions (Age 21+, No Pets, No Smoking/Cannabis) and requires my acceptance
* Scenario 2: Policies not accepted
   * Given the Terms & Conditions are displayed
   * When I do not accept them
   * Then the system does not allow me to proceed to payment
* Scenario 3: Policies in my language
   * Given I selected French (or English) as my language
   * When the Terms & Conditions are displayed
   * Then they are shown in the selected language

Business Rules

* Terms & Conditions include: Age 21+, No Pets, No Smoking/Cannabis.
* Policies must be accepted before payment information is taken.
* Policies are displayed in EN or FR, according to the guest's choice.
* Full Terms & Conditions text, including cancellation policy.
* User's acceptance must be stored as evidence including timestamp and T&C version.

Definition of Done (DoD)

* [ ] Code reviewed via Pull Request
* [ ] Test coverage implemented
* [ ] Documentation and Wiki updated
