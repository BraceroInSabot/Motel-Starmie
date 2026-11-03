[US-21] Forget Me (PII Anonymization)

# User Story

As an authorized staff member, I want to scrub a guest's personal information on request, So that the property complies with PIPEDA.

# Acceptance Criteria

* Scenario 1: Successful anonymization
   * Given a guest requested the removal of their personal information and I confirmed their identity
   * When I click "Forget Me" on the Guest Profile and confirm the action
   * Then the system scrubs the PII, deletes the guest's card and customer record at Stripe, keeps only the preferred language, and records the action in the audit log
* Scenario 2: Financial records preserved
   * Given a guest profile was anonymized
   * When I consult the financial records of their past stays
   * Then the records (dates, property and amounts) remain intact, and the invoices already issued are unchanged
* Scenario 3: Blocked by an active reservation
   * Given the guest has an Unconfirmed, Confirmed or In-House reservation, or an open balance
   * When I click "Forget Me"
   * Then the system blocks the action and informs me why

# Business Rules

* The "Forget Me" action lives in the Guest Profile module.
* Front Desk Agents and the General Manager can execute "Forget Me" (see US-01).
* The guest asks the motel by email, phone or in person. Staff confirm the guest's identity themselves before clicking "Forget Me"; the system does not automate this check.
* "Forget Me" is blocked while the guest has an Unconfirmed, Confirmed or In-House reservation, or an open balance.
* Anonymization keeps only the preferred language and the financial records of the stays (dates, property and amounts). No other demographic data is kept.
* After anonymization, the full_name_enc, email_enc, phone_enc and email_hash attributes are set to null.
* The guest's saved card and customer record at Stripe are deleted.
* Invoices already issued are kept unchanged, because businesses in Canada must keep their financial records. Only the profile and other personal data are anonymized.
* The action asks for confirmation, because it cannot be undone.
* The action is recorded in the audit log with who executed it and when, without any personal data.

# Definition of Done (DoD)

* [ ] Code reviewed via Pull Request
* [ ] Test coverage implemented
* [ ] Documentation and Wiki updated
