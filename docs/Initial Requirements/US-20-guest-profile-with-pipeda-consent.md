[US-20] Guest Profile with PIPEDA Consent

# User Story

As a Front Desk Agent, I want to maintain guest profiles with a PIPEDA consent record, So that personal information is handled in compliance with the law.

# Acceptance Criteria

* Scenario 1: Profile creation
   * Given a new guest is being registered
   * When I save the guest profile with the guest's consent
   * Then the system stores the PII (encrypted) together with the PIPEDA consent flag, the date and time of the consent and its source
* Scenario 2: Profile linked to a reservation
   * Given a guest profile exists
   * When a reservation is created for that guest
   * Then the reservation references the guest profile
* Scenario 3: Consent not given
   * Given a new guest is being registered
   * When the guest does not give consent
   * Then the system does not create the profile or the reservation
* Scenario 4: Returning guest
   * Given a profile exists with the email "ana@example.com"
   * When a new booking is made with the email "Ana@Example.com" and a new phone number
   * Then the system uses the existing profile and updates the phone number

# Business Rules

* A guest profile contains: full name, email, phone, preferred language (EN/FR) and the PIPEDA consent (yes or no, the date and time it was given, and its source: booking website, front desk or OTA).
* GuestProfile contains PII and must include the PIPEDA_consent_flag.
* If consent is not given, the guest cannot be registered. For OTA bookings, consent is considered given through the OTA's terms and is recorded with the source "OTA" (see US-07).
* The consent covers using the guest's personal data to manage their reservations and stays. The system sends no marketing emails in V1.
* A returning guest is recognized by their email address (case-insensitive): the same email means the same profile, and the name and phone are updated if they changed.
* One profile is shared by all properties (Bedford and Timberlea).
* The full name, email and phone are encrypted in the database.
* Profiles are kept until "Forget Me" is used (see US-21). There is no automatic deletion.
* Guest profiles must support data anonymization (see US-21).
* Front Desk Agents and the General Manager can view and edit guest profiles (see US-01). Guests editing their own profile is out of scope for V1.

# Definition of Done (DoD)

* [ ] Code reviewed via Pull Request
* [ ] Test coverage implemented
* [ ] Documentation and Wiki updated
