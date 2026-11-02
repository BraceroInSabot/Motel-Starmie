[US-11] Reservation Lifecycle Management
# User Story

As a Front Desk Agent, I want reservations to follow a controlled lifecycle, So that the state of each booking is always consistent.

# Acceptance Criteria

* Scenario 1: Valid transition
   * Given a reservation is in a given state
   * When an action moves it to the next allowed state
   * Then the system saves the new state
* Scenario 2: Invalid transition
   * Given a reservation is in a given state
   * When an action tries to move it to a state not allowed by the lifecycle
   * Then the system blocks the change
* Scenario 3: Cancellation or no-show
   * Given a reservation is in a state that allows it
   * When it is canceled or marked as no-show
   * Then the system saves the state Canceled or No-Show

# Business Rules

* Reservation states: Unconfirmed → Confirmed → In-House → Checked-Out, plus Canceled/No-Show.
* A reservation is canceled when a guest with a reservation status like Unconfirmed, Confirmed or In-House cancels on website or a staff user like Front Desk Agent or General Manager cancel.
* A reservation is setted with no-show if a guest with a confirmed reservation do not check-in. 
* The No-Show status is applied only after a grace period (in minutes). The General Manager sets this period, and it can be different for each property.
* Cancellation and no-show fees are optional and must be configured for each property by the General Manager.
* Whenever a cancellation or no-show fee is generated, it is stored in a dashboard accessible only to General Managers. From there, they can send emails to guests warning them about the generated fee.

# Definition of Done (DoD)

* [ ] Code reviewed via Pull Request
* [ ] Test coverage implemented
* [ ] Documentation and Wiki updated
