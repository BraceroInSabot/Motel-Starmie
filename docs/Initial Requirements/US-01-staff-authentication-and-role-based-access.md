[US-01] Staff Authentication and Role-Based Access

# User Story

As a motel staff member, I want to log into the Starmie PMS with my credentials, So that I can access only the features my role requires.

# Acceptance Criteria

* Scenario 1: Successful login
   * Given I am a registered and active staff member
   * When I enter my email address and password and confirm the login
   * Then the system authenticates me and redirects me to the home screen of my role
* Scenario 2: Invalid credentials
   * Given I am on the login screen
   * When I enter an unregistered email address or an incorrect password
   * Then the system denies access and displays a generic error message without specifying which field is incorrect
* Scenario 3: Housekeeper without financial access
   * Given I am authenticated as a Housekeeper
   * When I try to access financial data (folios, payments, rates or reports)
   * Then the system denies access
* Scenario 4: Account lockout
   * Given I have entered an incorrect password 9 consecutive times
   * When I enter an incorrect password a 10th time
   * Then the system locks my account for 15 minutes and denies every login attempt until it is unlocked
* Scenario 5: First login with a temporary password
   * Given the General Manager created my account with a temporary password
   * When I log in for the first time
   * Then the system requires me to set a new password before I can access any other screen
* Scenario 6: Session expiry
   * Given I logged in 12 hours ago
   * When I perform any action
   * Then the system ends my session and asks me to log in again

# Business Rules

* Staff roles: Front Desk Agent, General Manager/Owner and Housekeeper.
* Head Housekeeper is not a role. It is a privilege that the General Manager can grant to any Housekeeper.
* The Night Audit (US-14) is an automated system process, not a staff role.
* Access is controlled by role (RBAC).
* Staff log in with their email address, which is unique and case-insensitive.
* Passwords must have at least 12 characters, with no other composition rules. Common and leaked passwords are rejected.
* After 10 consecutive failed login attempts, the account is locked for 15 minutes. The General Manager can unlock it earlier. A successful login resets the counter.
* A session expires 12 hours after login, regardless of activity.
* The General Manager creates, edits and deactivates staff accounts. A new account receives a temporary password, which must be changed at the first login.
* Inactive staff members cannot log in.
* Each staff member works at one property. The General Manager has access to all properties.
* Each role has a permission matrix, which the General Manager can modify. The default matrix is:

| Feature | Front Desk Agent | General Manager | Housekeeper |
|---|---|---|---|
| Front desk work: reservations, walk-ins, check-in, check-out, folios, fines, cash deposits, early check-in approval | Yes | Yes | No |
| Housekeeping board and cleaning actions | No | Yes | Yes |
| Head Housekeeper actions: verify cleaning, move a room to Unavailable or Maintenance | No | Yes | Only with the Head Housekeeper privilege |
| Guest profiles and "Forget Me" | Yes | Yes | No |
| Night Audit report | No | Yes | No |
| Tax Summary report, Held Funds report, fee dashboard and occupancy report | No | Yes | No |
| Age-policy override at check-in | No | Yes | No |
| Settings: properties, rooms, deposit, fines, no-show and fee policy, OTA mapping, staff accounts and permissions | No | Yes | No |

* Housekeepers can never receive access to financial data, even through the permission matrix.
* The General Manager cannot remove their own access to settings and permissions.
* Only the General Manager can perform the age-policy override at check-in (see US-12).

# Definition of Done (DoD)

* [ ] Code reviewed via Pull Request
* [ ] Test coverage implemented
* [ ] Documentation and Wiki updated
