# US-02 — Staff Interface Language (EN/FR): Diagrams

> Sources: `US-02-staff-interface-language-en-fr.md`, `docs/Business Modeling/Business Modeling.md` (Section 7), `CLAUDE.md`.
> Elements tagged **PENDING** depend on business rules not defined yet. They are placeholders in the design, not decisions.
>
> **Main open decision:** whether the language is a **saved user preference** (Option A) or **chosen per session** (Option B), and which language is the default. Both options are drawn so the design does not presume the answer; the shared parts work for either one.

---

## 1. Class Diagram (Clean Architecture + Front-end)

```mermaid
classDiagram
    direction LR

    namespace Domain {
        class Language {
            <<Enumeration>>
            EN
            FR
            +from_code(code: str)$ Language
        }
        class UnsupportedLanguageError {
            <<Domain Exception>>
        }
        class StaffMember {
            <<Entity · from US-01>>
            -StaffMemberId id
            -Language | None preferred_language
            +change_language(language: Language) None
        }
        class GuestCommunicationLanguagePolicy {
            <<Domain Service>>
            +language_for(guest_language: Language) Language
        }
        class StaffInterfaceLanguageChanged {
            <<Domain Event · Option A>>
            +StaffMemberId staff_member_id
            +Language language
            +datetime occurred_at_utc
        }
    }

    namespace Application {
        class ListSupportedLanguagesUseCase {
            <<Use Case>>
            +execute() list~Language~
        }
        class ChangeStaffLanguageUseCase {
            <<Use Case · Option A>>
            +execute(command: ChangeStaffLanguageCommand) None
        }
        class ChangeStaffLanguageCommand {
            <<DTO>>
            +StaffMemberId staff_member_id
            +str language_code
        }
        class GuestCommunicationService {
            <<Application Service>>
            +send(recipient: str, guest_language: Language, template_key: str, context: dict) None
        }
        class StaffMemberRepository {
            <<Port · from US-01>>
            +get_by_id(staff_member_id: StaffMemberId) StaffMember
            +save(staff_member: StaffMember) None
        }
        class TemplateRenderer {
            <<Port>>
            +render(template_key: str, language: Language, context: dict) RenderedMessage
        }
        class EmailSender {
            <<Port>>
            +send(recipient: str, message: RenderedMessage) None
        }
        class EventPublisher {
            <<Port · from US-01>>
            +publish(event: DomainEvent) None
        }
    }

    namespace Infrastructure {
        class DjangoStaffMemberRepository {
            <<Adapter · from US-01>>
        }
        class DjangoTemplateRenderer {
            <<Adapter>>
        }
        class EmailSenderAdapter {
            <<Adapter>>
        }
        class InProcessEventPublisher {
            <<Adapter · from US-01>>
        }
    }

    namespace Interface {
        class LanguagesView {
            <<REST Controller>>
            +get(request) Response
        }
        class StaffPreferencesView {
            <<REST Controller · Option A>>
            +patch(request) Response
        }
        class RequestLanguageMiddleware {
            <<Middleware>>
            +resolve(request) Language
        }
    }

    namespace FrontEnd {
        class I18nProvider {
            <<React Context>>
            +Language language
            +setLanguage(language: Language) void
            +t(key: string) string
        }
        class LanguageSwitcher {
            <<React Component · MantineUI>>
            +options: Language[]
        }
        class TranslationCatalog {
            <<Resource>>
            +en: Record~string, string~
            +fr: Record~string, string~
        }
        class ApiClient {
            <<HTTP Client>>
            +request(path: string, options) Promise
        }
    }

    Language ..> UnsupportedLanguageError : raises
    StaffMember --> Language
    GuestCommunicationLanguagePolicy ..> Language
    StaffMember ..> StaffInterfaceLanguageChanged : records

    ListSupportedLanguagesUseCase ..> Language
    ChangeStaffLanguageUseCase ..> ChangeStaffLanguageCommand
    ChangeStaffLanguageUseCase --> StaffMemberRepository
    ChangeStaffLanguageUseCase --> EventPublisher
    GuestCommunicationService --> GuestCommunicationLanguagePolicy
    GuestCommunicationService --> TemplateRenderer
    GuestCommunicationService --> EmailSender

    DjangoStaffMemberRepository ..|> StaffMemberRepository
    DjangoTemplateRenderer ..|> TemplateRenderer
    EmailSenderAdapter ..|> EmailSender
    InProcessEventPublisher ..|> EventPublisher

    LanguagesView --> ListSupportedLanguagesUseCase
    StaffPreferencesView --> ChangeStaffLanguageUseCase
    RequestLanguageMiddleware ..> Language

    LanguageSwitcher --> I18nProvider
    I18nProvider --> TranslationCatalog
    I18nProvider --> ApiClient : sets Accept-Language
    ApiClient ..> LanguagesView : GET /api/v1/languages
    ApiClient ..> StaffPreferencesView : PATCH /api/v1/staff-members/me/preferences
```

### Design notes
- **`Language` is a closed enumeration (EN, FR).** The business rule allows only these two, so adding a third is a deliberate code change, not configuration. `from_code` rejects anything else with `UnsupportedLanguageError`.
- **Scenario 2:** `GET /api/v1/languages` returns only the values of `Language`, and the `LanguageSwitcher` builds its options from that response. The front end does not keep a separate hard-coded list.
- **Scenario 1 (front-end and back-end):**
  - **Front end:** the `I18nProvider` translates the UI using `TranslationCatalog` (`en`/`fr`).
  - **Back end:** `ApiClient` sends `Accept-Language` on every request, and `RequestLanguageMiddleware` turns on Django translation for API messages (e.g., the US-01 generic login error). It accepts only `en`/`fr`; anything else falls back to the default language, which is still PENDING.
- **Scenario 3:** `GuestCommunicationLanguagePolicy.language_for` takes only the guest's language. The staff language is not a parameter at all, so the staff member's choice cannot leak into guest emails. `GuestCommunicationService` is shared by the confirmation (US-08) and invoice (US-22) flows.
- **Option A only:**
  - `StaffMember.preferred_language`, `ChangeStaffLanguageUseCase`, `StaffPreferencesView` and `StaffInterfaceLanguageChanged`.
- **Option B only:**
  - the language lives in the client and is sent per request through `Accept-Language`;
  - none of the Option A elements is needed.

---

## 2. ER Diagram (PostgreSQL persistence)

```mermaid
erDiagram
    GUEST_PROFILE ||--o{ RESERVATION : "books"

    STAFF_MEMBER {
        uuid id PK "from US-01"
        varchar preferred_language "Option A only (PENDING): 'en' or 'fr', nullable, CHECK constraint"
    }
    GUEST_PROFILE {
        uuid id PK "partial: full model in US-25"
        varchar preferred_language "PENDING: guest language stored here or on RESERVATION"
    }
    RESERVATION {
        uuid id PK "partial: full model in US-08"
        uuid guest_profile_id FK
        varchar guest_language "PENDING: language chosen at booking, 'en' or 'fr', CHECK constraint"
    }
```

### Design notes
- **No language lookup table:** language columns are `varchar(2)` with `CHECK (language IN ('en', 'fr'))`. The set is closed by business rule, so a table would add joins without adding flexibility.
- **`STAFF_MEMBER.preferred_language`** is only created if Option A is chosen; under Option B the schema does not change.
- **Where the guest's language is stored is PENDING:**
  - on `GUEST_PROFILE`: one language per guest;
  - on `RESERVATION`: the language chosen for each booking, which matches "the confirmation email is sent in the language chosen";
  - only the column that is chosen will be created.
- **Partial tables:** only the columns relevant to this story are shown.

---

## 3. Event Flow

### 3.1 Changing the interface language — Scenario 1

```mermaid
sequenceDiagram
    autonumber
    actor Staff as Staff Member
    participant Switch as LanguageSwitcher
    participant I18n as I18nProvider
    participant Api as ApiClient
    participant View as StaffPreferencesView<br/>PATCH /api/v1/staff-members/me/preferences
    participant UC as ChangeStaffLanguageUseCase
    participant Repo as StaffMemberRepository
    participant Bus as EventPublisher

    Staff->>Switch: Select "Français"
    Switch->>I18n: setLanguage(FR)
    I18n->>I18n: Load "fr" catalog and re-render UI
    I18n->>Api: Set Accept-Language: fr

    alt Option A (PENDING): saved user preference
        Api->>View: PATCH {language: "fr"}
        View->>UC: execute(ChangeStaffLanguageCommand)
        UC->>UC: Language.from_code("fr")
        UC->>Repo: get_by_id(staff_member_id)
        Repo-->>UC: StaffMember
        UC->>UC: staff_member.change_language(FR)
        UC->>Repo: save(staff_member)
        UC->>Bus: publish(StaffInterfaceLanguageChanged)
        UC-->>View: done
        View-->>Api: 204 No Content
        Note over Api,UC: On the next login, the saved language is returned with the US-01 AuthenticationResult
    else Option B (PENDING): per session
        Note over I18n,View: Language kept in the client session only, with no back-end call
    end

    I18n-->>Staff: Whole staff interface displayed in French
```

### 3.2 Language options and back-end messages — Scenarios 1 and 2

```mermaid
sequenceDiagram
    autonumber
    participant Switch as LanguageSwitcher
    participant Api as ApiClient
    participant MW as RequestLanguageMiddleware
    participant View as LanguagesView<br/>GET /api/v1/languages
    participant UC as ListSupportedLanguagesUseCase
    participant Any as Any API endpoint

    Switch->>Api: Load language options
    Api->>MW: GET /api/v1/languages
    MW->>View: forward
    View->>UC: execute()
    UC-->>View: [EN, FR]
    View-->>Api: 200 OK [{code: "en"}, {code: "fr"}]
    Api-->>Switch: Options: English, Français only

    Api->>MW: Any request with Accept-Language
    alt Accept-Language is en or fr
        MW->>MW: Activate requested translation
    else Unsupported or missing language
        MW->>MW: Activate default language (PENDING)
    end
    MW->>Any: forward
    Any-->>Api: Response messages in the active language

    Note over Switch,UC: PATCH with an unsupported code (e.g., "es") returns 422 Unprocessable Entity (UnsupportedLanguageError)
```

### 3.3 Guest communication language — Scenario 3

```mermaid
sequenceDiagram
    autonumber
    actor Staff as Staff Member (interface in FR)
    participant Flow as Calling flow<br/>(confirmation US-08 / invoice US-22)
    participant Svc as GuestCommunicationService
    participant Policy as GuestCommunicationLanguagePolicy
    participant Renderer as TemplateRenderer
    participant Mail as EmailSender
    actor Guest as Guest (chose EN)

    Staff->>Flow: Action that triggers a guest email
    Flow->>Svc: send(recipient, guest_language = EN, template_key, context)
    Svc->>Policy: language_for(EN)
    Policy-->>Svc: EN
    Svc->>Renderer: render(template_key, EN, context)
    Renderer-->>Svc: RenderedMessage (EN)
    Svc->>Mail: send(recipient, message)
    Mail-->>Guest: Email in English
    Note over Staff,Svc: The staff interface language is never passed to the service
```

### 3.4 Domain events

| Event | Emitted by | When | Payload |
|---|---|---|---|
| `StaffInterfaceLanguageChanged` | `ChangeStaffLanguageUseCase` | Staff member saves a new language (Option A only) | `staff_member_id`, `language`, `occurred_at_utc` |

Under Option B the language change is a client-side state change and emits no domain event.
