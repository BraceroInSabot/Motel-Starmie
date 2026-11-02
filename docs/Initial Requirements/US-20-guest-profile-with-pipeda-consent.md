[US-20] Guest Profile with PIPEDA Consent

# User Story

As a Front Desk Agent, I want to maintain guest profiles with a PIPEDA consent record, So that personal information is handled in compliance with the law.

# Acceptance Criteria

* Scenario 1: Profile creation
   * Given a new guest is being registered
   * When I save the guest profile
   * Then the system stores the PII together with the PIPEDA consent flag
* Scenario 2: Profile linked to a reservation
   * Given a guest profile exists
   * When a reservation is created for that guest
   * Then the reservation references the guest profile

# Business Rules

* GuestProfile contains PII and must include the PIPEDA_consent_flag.
* Guest profiles must support data anonymization (see US-21).
* The profile fields are those defined in the ER diagram.
* If consent is not given, the guest cannot be registered.

# Definition of Done (DoD)

* [ ] Code reviewed via Pull Request
* [ ] Test coverage implemented
* [ ] Documentation and Wiki updated
