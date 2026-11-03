[US-04] Localized Tax Calculation

# User Story

As a General Manager, I want reservation totals and nightly charges to apply the correct localized taxes, So that the property complies with Canadian tax legislation.

# Acceptance Criteria

* Scenario 1: Taxes applied to a room night
   * Given a $100.00 room night at Bedford or Timberlea
   * When the system calculates the total
   * Then it shows the Marketing Levy ($3.00) and the HST ($14.42) on separate lines, and a total of $117.42
* Scenario 2: Rounding per line
   * Given a $89.99 room night
   * When the system calculates the taxes
   * Then the Marketing Levy is $2.70 (2.6997 rounded), the HST is $12.98 (14% of $92.69, rounded) and the total is $105.67
* Scenario 3: Tax rate change
   * Given the General Manager has registered a new HST rate with an effective date
   * When a night on or after that date is charged
   * Then the new rate is applied, without a code change, and amounts already charged do not change
* Scenario 4: Fines and fees are not taxed
   * Given a fine or a cancellation or no-show fee is charged
   * When the system calculates its total
   * Then no tax is added
* Scenario 5: Monetary precision
   * Given any monetary amount is calculated or stored
   * When the system processes it
   * Then it uses Decimal or integer cents, never floating-point numbers

# Business Rules

* The tax engine supports GST, HST, PST and municipal levies. It is modular, because rates change by province and municipality.
* Default tax rates, which the General Manager can edit:
   * HST: 14% for Nova Scotia, effective April 1, 2025.
   * Halifax Marketing Levy: 3%, applied to room nights at Bedford and Timberlea.
* The Marketing Levy is calculated on the nightly room rate. HST is calculated on the nightly room rate plus the rounded Marketing Levy.
* Only room nights are taxed. Fines (US-16) and cancellation and no-show fees (US-11) are not taxed.
* Each tax is calculated per line (per night or per charge) and rounded to the cent, with halves rounded up (0.005 becomes 0.01).
* The General Manager maintains the tax rates in the settings: tax name, area (province or municipality), rate and effective date. A change applies only to nights on or after its effective date. Amounts already charged never change.
* The tax rate used for a night is the rate in force on the local date of that night.
* Each tax is shown on its own line (e.g., HST, Marketing Levy) in quotes, folios, invoices and reports.
* Floating-point types (float/double) are forbidden for currency.
* Every monetary amount must be stored with both its value and its currency.

# Definition of Done (DoD)

* [ ] Code reviewed via Pull Request
* [ ] Test coverage implemented
* [ ] Documentation and Wiki updated
