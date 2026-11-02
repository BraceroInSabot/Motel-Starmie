[US-13] Deposit Pre-Authorization Hold
# User Story

As a Front Desk Agent, I want the system to place a deposit hold on the guest's card at check-in, So that the property is protected against damages and policy violations.

# Acceptance Criteria

* Scenario 1: Hold approved
   * Given the guest's ID was verified
   * When I request the deposit hold
   * Then the system calls the payment gateway and a $250 CAD pre-authorization hold is placed on the card
* Scenario 2: Hold declined
   * Given I requested the deposit hold
   * When the payment gateway declines it
   * Then the check-in cannot be completed and the missing deposit is flagged
* Scenario 3: Check-in completion
   * Given the ID was verified and the hold was approved
   * When I hand over the keys and confirm the check-in
   * Then the reservation changes to In-House and the room changes to Occupied

# Business Rules

* The deposit is a $250 CAD pre-authorization hold placed via the payment gateway API. This value can me modified by Genearl Manager at PMS configs.
* Check-in sets the reservation to In-House and the room to Occupied.
* Deposit handling for guests without a credit card (e.g., cash) can be registered by Front Desk Agents. They register it at the system and input his user password to confirm. 
* Holds do not need renewal, because the maximum stay (5 nights) is shorter than the gateway’s authorization period
* The Front Desk Agent assigns an Available room of the booked room type at check-in.

# Definition of Done (DoD)

* [ ] Code reviewed via Pull Request
* [ ] Test coverage implemented
* [ ] Documentation and Wiki updated
