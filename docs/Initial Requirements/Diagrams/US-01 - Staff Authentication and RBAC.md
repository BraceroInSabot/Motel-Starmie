# US-01 — Staff Authentication and Role-Based Access: Diagrams

> Sources: `US-01-staff-authentication-and-role-based-access.md`, `docs/Business Modeling/Business Modeling.md`, `CLAUDE.md`.
> Elements tagged **PENDING** depend on business rules not defined yet. They are placeholders in the design, not decisions.

---

## 1. Class Diagram (Clean Architecture)

Dependencies point inward: Interface → Application → Domain. Infrastructure implements the Application ports.

```mermaid
classDiagram
    direction LR

    namespace Domain {
        class StaffMember {
            <<Entity / Aggregate Root>>
            -StaffMemberId id
            -LoginIdentifier login_identifier
            -PasswordHash password_hash
            -Role role
            -bool is_active
            +can_authenticate() bool
            +has_permission(permission: Permission) bool
        }
        class StaffMemberId {
            <<Value Object>>
            +UUID value
        }
        class LoginIdentifier {
            <<Value Object>>
            +str value
            %% PENDING: email, username or employee ID
        }
        class PasswordHash {
            <<Value Object>>
            +str value
        }
        class Role {
            <<Enumeration>>
            FRONT_DESK_AGENT
            GENERAL_MANAGER
            HOUSEKEEPER
            HEAD_HOUSEKEEPER
            NIGHT_AUDITOR
        }
        class Permission {
            <<Enumeration>>
            FINANCIAL_DATA_ACCESS
            AGE_POLICY_OVERRIDE
            %% PENDING: complete permission matrix
        }
        class RolePermissionPolicy {
            <<Domain Service>>
            +permissions_for(role: Role) set~Permission~
            +is_allowed(role: Role, permission: Permission) bool
        }
        class StaffAuthenticated {
            <<Domain Event>>
            +StaffMemberId staff_member_id
            +Role role
            +datetime occurred_at_utc
        }
        class AuthenticationFailed {
            <<Domain Event>>
            +str attempted_identifier
            +datetime occurred_at_utc
        }
        class AccessDenied {
            <<Domain Event>>
            +StaffMemberId staff_member_id
            +Permission permission
            +datetime occurred_at_utc
        }
        class InvalidCredentialsError {
            <<Domain Exception>>
        }
        class PermissionDeniedError {
            <<Domain Exception>>
        }
    }

    namespace Application {
        class AuthenticateStaffUseCase {
            <<Use Case>>
            +execute(command: AuthenticateStaffCommand) AuthenticationResult
        }
        class AuthorizeStaffActionUseCase {
            <<Use Case>>
            +execute(staff_member_id: StaffMemberId, permission: Permission) None
        }
        class AuthenticateStaffCommand {
            <<DTO>>
            +str login_identifier
            +str password
        }
        class AuthenticationResult {
            <<DTO>>
            +str access_token
            +Role role
            +str home_screen
        }
        class StaffMemberRepository {
            <<Port>>
            +find_by_login_identifier(identifier: LoginIdentifier) StaffMember | None
            +get_by_id(staff_member_id: StaffMemberId) StaffMember
        }
        class PasswordHasher {
            <<Port>>
            +verify(raw_password: str, password_hash: PasswordHash) bool
            +verify_dummy(raw_password: str) None
        }
        class TokenService {
            <<Port>>
            +issue(staff_member: StaffMember) str
            +resolve(token: str) StaffMemberId
        }
        class EventPublisher {
            <<Port>>
            +publish(event: DomainEvent) None
        }
        class Clock {
            <<Port>>
            +now_utc() datetime
        }
    }

    namespace Infrastructure {
        class DjangoStaffMemberRepository {
            <<Adapter>>
        }
        class DjangoPasswordHasher {
            <<Adapter>>
        }
        class TokenServiceAdapter {
            <<Adapter>>
            %% PENDING: session timeout
        }
        class InProcessEventPublisher {
            <<Adapter>>
        }
        class SystemClock {
            <<Adapter>>
        }
    }

    namespace Interface {
        class AuthSessionsView {
            <<REST Controller>>
            +post(request) Response
        }
        class RequiresPermission {
            <<Authorization Guard>>
            +check(request, permission: Permission) None
        }
    }

    StaffMember *-- StaffMemberId
    StaffMember *-- LoginIdentifier
    StaffMember *-- PasswordHash
    StaffMember --> Role
    RolePermissionPolicy ..> Role
    RolePermissionPolicy ..> Permission
    StaffMember ..> RolePermissionPolicy : delegates permission check

    AuthenticateStaffUseCase ..> AuthenticateStaffCommand
    AuthenticateStaffUseCase ..> AuthenticationResult
    AuthenticateStaffUseCase --> StaffMemberRepository
    AuthenticateStaffUseCase --> PasswordHasher
    AuthenticateStaffUseCase --> TokenService
    AuthenticateStaffUseCase --> EventPublisher
    AuthenticateStaffUseCase --> Clock
    AuthenticateStaffUseCase ..> StaffAuthenticated : emits
    AuthenticateStaffUseCase ..> AuthenticationFailed : emits
    AuthenticateStaffUseCase ..> InvalidCredentialsError : raises

    AuthorizeStaffActionUseCase --> StaffMemberRepository
    AuthorizeStaffActionUseCase --> EventPublisher
    AuthorizeStaffActionUseCase ..> AccessDenied : emits
    AuthorizeStaffActionUseCase ..> PermissionDeniedError : raises

    DjangoStaffMemberRepository ..|> StaffMemberRepository
    DjangoPasswordHasher ..|> PasswordHasher
    TokenServiceAdapter ..|> TokenService
    InProcessEventPublisher ..|> EventPublisher
    SystemClock ..|> Clock

    AuthSessionsView --> AuthenticateStaffUseCase
    RequiresPermission --> TokenService
    RequiresPermission --> AuthorizeStaffActionUseCase
```

### Design notes
- **One role per staff member**, following the personas of the business document. PENDING: whether Head Housekeeper is a separate role or a permission granted to a Housekeeper, which may turn this into a one-to-many relationship.
- **Known permissions only:** `FINANCIAL_DATA_ACCESS` (folios, payments, rates, reports — denied to Housekeeper and Head Housekeeper) and `AGE_POLICY_OVERRIDE` (management only, US-17). The rest of the matrix is PENDING.
- **`verify_dummy`** runs a hash check when the identifier does not exist, so response time does not reveal whether an identifier is registered (Scenario 2: no field is identified as incorrect).
- **`InProcessEventPublisher`** keeps the domain independent of the broker. RabbitMQ can replace the adapter later without touching the domain or use cases.
- **`Clock`** is a port so that timestamps are always UTC and tests are deterministic.

---

## 2. ER Diagram (PostgreSQL persistence)

```mermaid
erDiagram
    ROLE ||--o{ STAFF_MEMBER : "is assigned to"
    ROLE ||--o{ ROLE_PERMISSION : grants
    PERMISSION ||--o{ ROLE_PERMISSION : "is granted by"

    STAFF_MEMBER {
        uuid id PK
        varchar login_identifier UK "PENDING: email, username or employee ID"
        varchar password_hash "never stored in plain text"
        varchar role_code FK
        boolean is_active
        timestamptz created_at "UTC"
        timestamptz updated_at "UTC"
    }
    ROLE {
        varchar code PK "FRONT_DESK_AGENT, GENERAL_MANAGER, HOUSEKEEPER, HEAD_HOUSEKEEPER, NIGHT_AUDITOR"
        varchar name
    }
    PERMISSION {
        varchar code PK "FINANCIAL_DATA_ACCESS, AGE_POLICY_OVERRIDE, ..."
        varchar description
    }
    ROLE_PERMISSION {
        varchar role_code PK, FK
        varchar permission_code PK, FK
    }
```

### Design notes
- `ROLE_PERMISSION` holds the permission matrix as data, so completing it (PENDING) needs no schema change.
- All timestamps are `timestamptz` and stored in UTC (Business Modeling, Section 4).
- **Not modelled until defined:**
  - staff ↔ property access (US-03): would add a `STAFF_PROPERTY_ACCESS` table;
  - lockout after failed attempts: would add attempt counters or an attempt table;
  - MFA: would add a factor table;
  - audit trail of authentication events: would add an `AUTHENTICATION_EVENT` table.

---

## 3. Event Flow

### 3.1 Login — Scenarios 1 and 2

```mermaid
sequenceDiagram
    autonumber
    actor Staff as Staff Member
    participant UI as React App (MantineUI)
    participant API as AuthSessionsView<br/>POST /api/v1/auth/sessions
    participant UC as AuthenticateStaffUseCase
    participant Repo as StaffMemberRepository
    participant Hasher as PasswordHasher
    participant Token as TokenService
    participant Bus as EventPublisher

    Staff->>UI: Enter credentials and confirm
    UI->>API: POST {login_identifier, password}
    API->>UC: execute(AuthenticateStaffCommand)
    UC->>Repo: find_by_login_identifier(identifier)
    Repo-->>UC: StaffMember | None

    alt Identifier not registered
        UC->>Hasher: verify_dummy(password)
        UC->>Bus: publish(AuthenticationFailed)
        UC-->>API: raise InvalidCredentialsError
        API-->>UI: 401 Unauthorized (generic message)
        UI-->>Staff: Generic error, no field identified
    else Incorrect password
        UC->>Hasher: verify(password, password_hash)
        Hasher-->>UC: false
        UC->>Bus: publish(AuthenticationFailed)
        UC-->>API: raise InvalidCredentialsError
        API-->>UI: 401 Unauthorized (generic message)
        UI-->>Staff: Generic error, no field identified
    else Correct password, staff member inactive
        UC->>Hasher: verify(password, password_hash)
        Hasher-->>UC: true
        UC->>UC: can_authenticate() = false
        UC->>Bus: publish(AuthenticationFailed)
        UC-->>API: raise InvalidCredentialsError
        API-->>UI: 401 Unauthorized (generic message)
        UI-->>Staff: Access denied
    else Correct password, staff member active
        UC->>Hasher: verify(password, password_hash)
        Hasher-->>UC: true
        UC->>UC: can_authenticate() = true
        UC->>Token: issue(staff_member)
        Token-->>UC: access_token
        UC->>Bus: publish(StaffAuthenticated)
        UC-->>API: AuthenticationResult(access_token, role, home_screen)
        API-->>UI: 201 Created {access_token, role, home_screen}
        UI-->>Staff: Redirect to the home screen of the role
    end

    Note over UC,Hasher: PENDING: lockout after failed attempts, MFA and password policy
    Note over UI,UC: PENDING: whether an inactive staff member sees a specific message
```

### 3.2 Authorization — Scenario 3 (Housekeeper and financial data)

```mermaid
sequenceDiagram
    autonumber
    actor HK as Housekeeper
    participant UI as React App (MantineUI)
    participant Guard as RequiresPermission
    participant Token as TokenService
    participant UC as AuthorizeStaffActionUseCase
    participant Repo as StaffMemberRepository
    participant Policy as RolePermissionPolicy
    participant Bus as EventPublisher
    participant API as Financial endpoint<br/>e.g. GET /api/v1/folios/{id}

    HK->>UI: Open financial data (folio, payment, rate or report)
    UI->>Guard: Request with access_token
    Guard->>Token: resolve(access_token)

    alt Token invalid or expired
        Token-->>Guard: error
        Guard-->>UI: 401 Unauthorized
        UI-->>HK: Redirect to login
    else Token valid
        Token-->>Guard: staff_member_id
        Guard->>UC: execute(staff_member_id, FINANCIAL_DATA_ACCESS)
        UC->>Repo: get_by_id(staff_member_id)
        Repo-->>UC: StaffMember(role = HOUSEKEEPER)
        UC->>Policy: is_allowed(HOUSEKEEPER, FINANCIAL_DATA_ACCESS)
        Policy-->>UC: false
        UC->>Bus: publish(AccessDenied)
        UC-->>Guard: raise PermissionDeniedError
        Guard-->>UI: 403 Forbidden
        UI-->>HK: Access denied
        Note over Guard,API: The request never reaches the financial endpoint
    end
```

### 3.3 Domain events

| Event | Emitted by | When | Payload |
|---|---|---|---|
| `StaffAuthenticated` | `AuthenticateStaffUseCase` | Active staff member authenticated | `staff_member_id`, `role`, `occurred_at_utc` |
| `AuthenticationFailed` | `AuthenticateStaffUseCase` | Unknown identifier, wrong password or inactive staff member | `attempted_identifier`, `occurred_at_utc` |
| `AccessDenied` | `AuthorizeStaffActionUseCase` | Role lacks the required permission | `staff_member_id`, `permission`, `occurred_at_utc` |

Consumers (e.g., lockout counter, audit log) are PENDING until the related rules are defined.
