[US-21] Forget Me (PII Anonymization)

# User Story

As an authorized staff member, I want to scrub a guest's personal information on request, So that the property complies with PIPEDA.

# Acceptance Criteria

* Scenario 1: Successful anonymization
   * Given a guest requested the removal of their personal information
   * When I click "Forget Me" on the Guest Profile
   * Then the system scrubs the PII, leaving only anonymous demographic data
* Scenario 2: Financial records preserved
   * Given a guest profile was anonymized
   * When I consult the financial records of their past stays
   * Then the records remain intact, attached to the anonymous demographic data

# Business Rules

* The "Forget Me" action lives in the Guest Profile module.
* Anonymization keeps only anonymous demographic data attached to financial records.
* Every role except Housekeeper and Head Housekeeper can execute "Forget Me".
* After anonymization, the full_name_enc, email_enc, phone_enc and email_hash attributes are set to null.

# Definition of Done (DoD)

* [ ] Code reviewed via Pull Request
* [ ] Test coverage implemented
* [ ] Documentation and Wiki updated
