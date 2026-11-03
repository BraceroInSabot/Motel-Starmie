# Languages, Frameworks and Tools used

> The user stories in `docs/Initial Requirements/` (US-01 to US-23) are the source of truth for what each tool must do. The "Used for" column points to the stories that need each tool.

## Front-End

| Tool | Used for |
|---|---|
| HTML, CSS | Pages and the HTML templates for PDFs (invoice and reports, US-17, US-22) |
| JavaScript, TypeScript | Application code |
| React | Booking widget (EN/FR), front desk dashboard, housekeeping board, settings and reports (US-03, US-09, US-10, US-18) |
| MantineUI | UI components (default theme; the business has no palette or logo) |
| Stripe Elements (hosted fields) | Card entry on the booking widget and on the front desk screen; card data never reaches the backend (US-06, US-09, US-13) |

## Backend

| Tool | Used for |
|---|---|
| Python | Application code |
| Django | REST API, authentication and permissions (US-01), admin settings |
| Django Channels | WebSockets for the real-time housekeeping board and room states on the front desk dashboard (US-10, US-18) |
| RabbitMQ | Channel layer for Django Channels and asynchronous work (emails, Stripe retries) |
| cron | Timezone-aware scheduled jobs: Night Audit at 2:00 AM local time (US-14), no-show check every 15 minutes (US-11), deposit release retries (US-17) |
| Stripe API | Charges at booking, refunds, deposit holds (authorize, capture, release), saved cards, customer deletion on "Forget Me" (US-06, US-11, US-13, US-17, US-21) |
| WeasyPrint | PDF generation from HTML templates: invoice and reports (US-17, US-22, US-23) |
| pytest | Unit and integration tests (Definition of Done of every user story) |
| Poetry | Python dependency management |

## Infrastructure and Database

| Tool | Used for |
|---|---|
| PostgreSQL | Main database (optimistic locking on room inventory, double-entry ledger, audit logs) |
| Docker | Local and deployment containers |
| Kubernetes | Container orchestration |
| Terraform | Infrastructure as code |
| Zabbix | Monitoring |
| Protheus | Monitoring |

## Phases

The project moves to the next phase only when the project owner asks.

| Phase | Tools |
|---|---|
| V1 (current) | Python, Django, Poetry, PostgreSQL, Docker, pytest, JavaScript, React, TypeScript, MantineUI, plus the tools the user stories require: Stripe, Django Channels, RabbitMQ (channel layer), cron and WeasyPrint |
| V2 | V1 + CI/CD, Kubernetes, AWS, RabbitMQ (full use) and deployment to a VPS |
| V3 | V2 + monitoring with Zabbix and Protheus, and API hardening tests in CI/CD |
