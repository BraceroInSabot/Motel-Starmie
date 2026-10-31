[US-04] Localized Tax Calculation
# User Story

As a General Manager, I want reservation totals and nightly charges to apply the correct localized taxes, So that the property complies with Canadian tax legislation.

# Acceptance Criteria

* Scenario 1: Tax applied to a stay
   * Given a stay is being priced for the property in Nova Scotia
   * When the system calculates the total
   * Then the applicable tax is calculated on the room rate and displayed separately from it
* Scenario 2: Tax rate change
   * Given an applicable tax rate has changed
   * When charges are calculated after the change takes effect
   * Then the new rate is applied without requiring a code change
* Scenario 3: Monetary precision
   * Given any monetary amount is calculated or stored
   * When the system processes it
   * Then it uses Decimal or integer cents, never floating-point numbers

# Business Rules

* The tax engine must support GST, HST and PST.
* The tax engine must be modular, because rates change by province and municipal laws.
* Floating-point types (float/double) are forbidden for currency.
* Any monetary amount must have its value and currency at the dictionaries.
* Applicable municipal taxes or levies, if any.
* Rounding rule (per line or per folio) and who maintains the tax rates.

# Definition of Done (DoD)

* [ ] Code reviewed via Pull Request
* [ ] Test coverage implemented
* [ ] Documentation and Wiki updated
