[US-15] Folio Ledger

# User Story

As a Front Desk Agent, I want every reservation to have a folio recording all charges and payments, So that the guest's balance is always accurate.

# Acceptance Criteria

* Scenario 1: Folio created
   * Given a reservation is created
   * When the system saves it
   * Then a folio is created for that reservation
* Scenario 2: Posting entries
   * Given a reservation has a folio
   * When a charge or a payment is posted
   * Then it is recorded as a double-entry ledger entry and the balance is updated
* Scenario 3: Monetary precision
   * Given an entry is posted
   * When the amount is stored
   * Then it uses Decimal or integer cents in CAD, never floating-point numbers
* Scenario 4: Split payment
   * Given a folio has a balance of $200.00
   * When the guest pays $120.00 by card and $80.00 in cash
   * Then both payments are recorded in the same folio and the balance is $0.00
* Scenario 5: Void by the General Manager
   * Given a charge was posted by mistake
   * When the General Manager voids it and enters a reason
   * Then the system adds a reversing entry, keeps the original entry, and records the reason, who voided it and when
* Scenario 6: Correction attempted by a Front Desk Agent
   * Given I am a Front Desk Agent
   * When I try to void a charge or issue a refund
   * Then the system denies the action

# Business Rules

* Every reservation has exactly one folio.
* The folio is a double-entry accounting ledger.
* Charge types: room night, taxes (HST and Marketing Levy), fines (see US-16), cancellation fee and no-show fee (see US-11).
* Payment types: card through Stripe (at booking), OTA prepaid (see US-07), cash, deposit captured from a card hold (see US-16), cash deposit received and returned (see US-13), and refunds.
* Only these charge and payment types can be posted. Staff cannot add other charges by hand.
* The folio supports split payments: one folio can be paid with several payments and payment methods.
* Only the General Manager can make corrections:
   * Void: reverses a charge posted by mistake.
   * Refund: returns money to the guest, through Stripe or in cash.
* Corrections never edit or delete an entry. They add a reversing entry with a required reason, and record who made the correction and when.
* The ledger uses this starting set of accounts, which an accountant can adjust later: guest receivable, cash, card (Stripe), OTA receivable, room revenue, fine revenue, fee revenue, HST payable, Marketing Levy payable and cash deposits held.
* All amounts are in CAD.
* Front Desk Agents and the General Manager can view folios. Housekeepers can never view them (see US-01).

# Definition of Done (DoD)

* [ ] Code reviewed via Pull Request
* [ ] Test coverage implemented
* [ ] Documentation and Wiki updated
