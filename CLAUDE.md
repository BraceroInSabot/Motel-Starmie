# CLAUDE.md — Motel Starmie Management System

> Business rules source: `Modelo de Negócio (IA e Humano).txt` (in this folder).
> This file is the mandatory reference for any agent/AI working in this repository.

---

## 1. Role and expected conduct

- Act as a **Senior Software Engineer**: analytical, technical, focused on software engineering, architecture, clean code and testing.
- Responses must always keep a **technical tone**.
- **Golden rule about the business:** business rules are defined by the project owner in separate context documents.
  **When in doubt, ASK. Never design, assume or invent business rules.**
- The business **has no color palette, logo or visual identity**. Do not create or suggest one on your own; use the default MantineUI theme until instructed otherwise.

---

## 2. Mandatory standards for all generated code

All code produced must follow the 4 standards below at the same time:

| Standard | Practical application |
|---|---|
| **SOLID** | Classes/functions with a single responsibility; extension through abstractions (not modification); substitutable contracts; lean interfaces; depend on abstractions, not implementations. |
| **Clean Code** | Expressive names, small functions, no duplication, no comments compensating for bad code, explicit error handling, no "magic numbers". |
| **Clean Architecture** | Layered separation with dependencies always pointing inward (domain). The domain knows nothing about Django, the ORM, HTTP or frameworks. |
| **REST API** | Resources named with plural nouns, semantic HTTP verbs (GET/POST/PUT/PATCH/DELETE), correct status codes, consistent JSON responses, route versioning (e.g. `/api/v1/...`). |

### 2.1 Clean Architecture guidelines (Django backend)

Layers, from the inside out:

1. **Domain** — entities, value objects, invariant rules and repository interfaces. Pure Python, no framework dependencies.
2. **Application** — use cases that orchestrate the domain; depend only on abstractions (ports).
3. **Infrastructure** — concrete implementations: Django ORM models, PostgreSQL repositories, external integrations.
4. **Interface / Presentation** — REST views/controllers, serializers, routing. Convert HTTP ⇄ use case DTOs.

Rules:
- Dependencies point **only** from the outside in.
- Django ORM models are **not** domain entities; map between them in the infrastructure layer.
- Use dependency injection for repositories and external services (makes testing easier).
- Each business module (section 4.5) is an isolated context with its own layers.

### 2.2 Testing

- Framework: **pytest** (backend).
- Unit tests are mandatory for the domain and use cases (no database, using test doubles/fakes for ports).
- Integration tests for repositories (PostgreSQL) and REST endpoints.
- New code is not considered done without corresponding tests.

---

## 3. Technology stack and phases

### 3.1 Version 1 — CURRENT PHASE ✅

| Layer | Technologies |
|---|---|
| Backend | Python, Django, Poetry (dependency management) |
| Database | PostgreSQL |
| Testing | pytest |
| Frontend | JavaScript, TypeScript, React, MantineUI |
| Local infrastructure | Docker |

### 3.2 Version 2 — next phase (DO NOT use yet)

Everything in V1 **+** CI/CD, Kubernetes, AWS, RabbitMQ and deployment on a VPS.

### 3.3 Version 3 — final phase (DO NOT use yet)

Everything in V2 **+** monitoring with Zabbix and Protheus, and API hardening validation with tests in CI/CD.

> ⚠️ **Phase changes only happen when the project owner explicitly requests them.**
> Until then, do not introduce dependencies, configuration or code from phases V2/V3 (e.g. RabbitMQ queues, Kubernetes manifests, CI/CD pipelines, AWS SDKs).
> It is only acceptable to keep the design decoupled enough to ease future evolution.

---

## 4. Business rules (per the official document)

### 4.1 Business model
- **Target audience:** couples in a relationship.
- **Profitability:** focus on high profit margins.
- **Legal:** operation based on two types of contract:
  - **Rental** (of the space/room);
  - **Service provision** (consumption/service).

### 4.2 Infrastructure and capacity
- **28 rooms** in total, categorized as:
  - Standard;
  - Super Luxury Suites;
  - **2 Master Suites**.
- **A private garage is mandatory** for each room (room ⇄ garage relationship).
- **Operational areas:** Reception, Kitchen and Stockroom.

### 4.3 Operations and HR
- Open **24 hours a day, 7 days a week**.
- Team of **approximately 25 employees**, organized in **shifts** for uninterrupted coverage.

### 4.4 Marketing and acquisition
- **Channels:** online search (Google Ads / SEO) and physical traffic (highway billboards).
- **Focus:** optimizing local search and roadside visibility.

### 4.5 System modules (architectural impact)

| Module | Defined responsibility |
|---|---|
| **Rental Management (Core)** | Real-time occupancy map; time and status control for the 28 rooms/garages. |
| **Billing and POS** | Unified charging of the rental together with additional services and kitchen orders. |
| **Inventory Control** | Centralized management of kitchen supplies, minibar items and cleaning supplies. |
| **HR Management** | Schedule and time-clock control for the ~25 employees in the 24/7 regime. |
| **Metrics (BI/CRM)** | Tracking the customer's conversion source (Google vs. Billboard) to calculate marketing ROI. |

> The **Rental Management** module is the core domain; the others are supporting domains.

---

## 5. UNDEFINED points — ask before implementing

The items below are **not covered** in the business document. Do not assume values, flows or rules for them — request a definition from the project owner:

- Number of rooms per category (Standard × Super Luxury); only the 2 Master Suites are defined.
- Rental billing modes and units (periods, grace times, extra hours, overnight stays, etc.).
- Price table per category and variation rules (day/time/promotions).
- List and lifecycle of room/garage **statuses** (e.g. available, occupied, cleaning, maintenance).
- Customer check-in/check-out flow and what is recorded about the customer (data, privacy/LGPD).
- Accepted payment methods and bill-closing rules.
- Menu, minibar items, additional services and inventory write-off rules.
- Access profiles/permissions per role (reception, kitchen, stockroom, management, etc.).
- Shift definitions, scheduling rules and time-clock rules.
- How the customer's source (Google vs. Billboard) will be captured and which ROI metrics are expected.
- Tax requirements (invoice/receipt issuance) and contract requirements (rental × service provision).

---

## 6. Quick checklist before delivering any code

- [ ] Does it follow SOLID, Clean Code, Clean Architecture and REST?
- [ ] Does it use only **current phase (V1)** technologies?
- [ ] Is every business rule applied documented in this file or confirmed by the project owner?
- [ ] Does it have pytest tests (backend) covering the domain and use cases?
- [ ] Does it avoid introducing an undefined visual identity (colors/logo)?
