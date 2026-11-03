[US-24] Staff Interface Language

# User Story

As a motel staff member, I want to use the Starmie PMS in English or French, So that I can work in the language I prefer.

# Acceptance Criteria

* Scenario 1: Default language
   * Given the General Manager creates my account without choosing a language
   * When I log in for the first time
   * Then the staff screens are displayed in English
* Scenario 2: Changing my language
   * Given I am logged in and my language is English
   * When I change my language to French
   * Then every staff screen is displayed in French immediately, and the choice is kept for my next logins on any device
* Scenario 3: Language set by the General Manager
   * Given the General Manager creates or edits my account and chooses French
   * When I log in
   * Then the staff screens are displayed in French
* Scenario 4: Guest communication is not affected
   * Given my language is French and the guest's language is English
   * When I confirm the guest's reservation
   * Then the guest's email is sent in English

# Business Rules

* The staff interface supports only English (EN) and French (FR).
* The language is saved on each staff account. The default is English.
* Each staff member can change their own language at any time. The General Manager can also set it when creating or editing an account (see US-01).
* The language applies to every staff screen (front desk dashboard, housekeeping board, guest profiles, folios, settings and reports), to system messages, and to emails sent to the staff member (e.g., the password reset email, see US-01).
* Report exports (PDF and CSV, see US-22 and US-23) use the language of the staff member who exports them.
* Content entered in both languages by the General Manager (room type names and descriptions, fine names) is shown in the staff member's language.
* Guest-facing content (booking widget, Terms & Conditions, guest emails and invoices) always follows the guest's language, not the staff member's.
* The warning email sent to the developer when the Night Audit fails (see US-14) is always in English.

# Definition of Done (DoD)

* [ ] Code reviewed via Pull Request
* [ ] Test coverage implemented
* [ ] Documentation and Wiki updated
