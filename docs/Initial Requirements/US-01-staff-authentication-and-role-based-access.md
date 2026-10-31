[US-01] Staff Authentication and Role-Based Access
# User Story
As a motel staff member, I want to log into the Starmie PMS with my credentials, So that I can access only the features my role requires.

# Acceptance Criteria

* Scenario 1: Successful login
   * Given I am a registered and active staff member
   * When I enter valid credentials and confirm the login
   * Then the system authenticates me and redirects me to the home screen of my role
* Scenario 2: Invalid credentials
   * Given I am on the login screen
   * When I enter an unregistered identifier or an incorrect password
   * Then the system denies access and displays a generic error message without specifying which field is incorrect
* Scenario 3: Housekeeper without financial access
   * Given I am authenticated as a Housekeeper
   * When I try to access financial data (folios, payments, rates or reports)
   * Then the system denies access

# Business Rules

* Staff roles: Front Desk Agent, General Manager/Owner, Housekeeper, Head Housekeeper and Night Auditor.
* Access is controlled by role (RBAC).
* Housekeepers have no access to financial data.
* Only management can perform the age-policy override at check-in (see US-12).
* Complete permission matrix per role. Can be modified by General Manager.
* Login identifier, password policy, lockout after 10 times failed attempts and session timeout - 12 hours.
* Head Housekeeper is a attribute (previlege) conceded by General Manager for any Housekeeper.

# Definition of Done (DoD)

* [ ] Code reviewed via Pull Request
* [ ] Test coverage implemented
* [ ] Documentation and Wiki updated

