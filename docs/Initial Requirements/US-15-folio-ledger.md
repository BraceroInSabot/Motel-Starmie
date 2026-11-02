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

# Business Rules

* Every reservation has exactly one folio.
* The folio is a double-entry accounting ledger.
* Charges include room rate and fines; payments include cash, credit card and deposits.
* Also includes corrections (voids, refunds) and who authorizes them.
* Also register payment split folios.

# Definition of Done (DoD)

* [ ] Code reviewed via Pull Request
* [ ] Test coverage implemented
* [ ] Documentation and Wiki updated
