[US-13] Deposit Pre-Authorization Hold

# User Story

As a Front Desk Agent, I want the system to place a deposit hold on the guest's card at check-in, So that the property is protected against damages and policy violations.

# Acceptance Criteria

* Scenario 1: Hold approved
   * Given the guest's ID was verified
   * When I request the deposit hold
   * Then the system calls Stripe and a pre-authorization hold for the property's deposit amount (default $250 CAD) is placed on the guest's card
* Scenario 2: Hold declined
   * Given I requested the deposit hold
   * When Stripe declines it
   * Then the check-in cannot be completed, the missing deposit is flagged, and I can try another card or take a cash deposit
* Scenario 3: Cash deposit
   * Given the guest's ID was verified and the guest has no credit card
   * When I register a cash deposit for the property's deposit amount and confirm it with my own password
   * Then the system records the cash deposit in the folio and the deposit requirement is met
* Scenario 4: Room assignment
   * Given the ID was verified and the deposit was taken
   * When I choose a room
   * Then the system offers only Available rooms of the booked room type at my property
* Scenario 5: Check-in completion
   * Given the ID was verified, the deposit was taken and a room was assigned
   * When I hand over the keys and confirm the check-in
   * Then the reservation changes to In-House and the room changes to Occupied

# Business Rules

* The deposit is a pre-authorization hold placed through Stripe. Its amount is set for each property by the General Manager in the settings. The default is $250 CAD.
* Check-in steps, in this order: ID verification (US-12), early check-in approval if before 4:00 PM (US-12), deposit (card hold or cash deposit), room assignment, check-in confirmation. The deposit cannot be taken before the ID is verified.
* The card hold is placed on the card Stripe kept at booking (see US-06). Guests with no card on file (OTA guests and cash walk-ins) either enter a card in Stripe's secure fields at check-in or leave a cash deposit.
* If the card hold is declined, the agent can try another card or take a cash deposit. The check-in stays blocked until one of them succeeds.
* For guests without a credit card, a Front Desk Agent registers a cash deposit for the property's deposit amount and enters their own password to confirm it. The cash deposit is recorded in the folio.
* A failed password confirmation counts towards the US-01 lockout (10 failed attempts), in the same way as a failed login.
* At check-out, the cash deposit is returned to the guest in cash, minus any fines (see US-16). The return is also recorded in the folio.
* Holds do not need renewal, because the maximum stay (5 nights) is shorter than the gateway's authorization period.
* The Front Desk Agent assigns an Available room of the booked room type at check-in.
* Check-in sets the reservation to In-House and the room to Occupied.

# Definition of Done (DoD)

* [ ] Code reviewed via Pull Request
* [ ] Test coverage implemented
* [ ] Documentation and Wiki updated
