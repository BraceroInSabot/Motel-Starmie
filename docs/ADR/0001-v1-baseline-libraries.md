# ADR-0001: V1 baseline libraries and versions

* **Status:** Accepted
* **Date:** 2026-11-03
* **Deciders:** Project owner (Guilherme Bracero Gonzales)

## Context

The Technical Specs (section 6) list the libraries used inside the V1 technologies and require an ADR
whenever a library is introduced (5.5, point 5). The project skeleton is the first time code exists,
so the infrastructure libraries are introduced now. Story-specific libraries are not.

## Decision

**Runtime versions**

| Item | Choice | Reason |
|---|---|---|
| Python | 3.13 | Supported by Django 5.2 (3.10–3.14) |
| Django | 5.2 LTS (`>=5.2,<5.3`) | Security fixes until April 2028. Django 6.1 (Aug 2026) ends in Dec 2027 and would force a move to 6.2 LTS mid-project |
| Node | 22 LTS | Vite 8 and the test tools support it |

**Backend libraries introduced now:** `djangorestframework`, `drf-spectacular`, `channels`,
`channels-rabbitmq` (see ADR-0002), `daphne`, `psycopg[binary]`, `dj-database-url`, `argon2-cffi`.

**Backend dev/test:** `ruff`, `mypy`, `django-stubs` 5.2.x, `djangorestframework-stubs` 3.16.x,
`import-linter`, `pytest`, `pytest-django`, `pytest-cov`, `factory-boy`, `freezegun`, `pre-commit`.
`django-stubs` stays on the 5.2 line to match Django; that pins `mypy` below 1.20 and
`djangorestframework-stubs` to 3.16.x.

**Front-end runtime:** `@mantine/core`, `@mantine/hooks`, `@mantine/dates`, `@mantine/form`,
`@mantine/notifications`, `react-router`, `@tanstack/react-query`, `i18next`, `react-i18next`, `dayjs`.

**Front-end dev/test:** see ADR-0003 (TypeScript and ESLint), plus `vitest`, `@vitest/coverage-v8`,
`jsdom`, `@testing-library/react`, `@testing-library/user-event`, `@testing-library/jest-dom`, `msw`,
`prettier`, `postcss-preset-mantine`, `postcss-simple-vars`.

**Deferred to their stories** (each gets its own ADR entry when added):

| Library | Story |
|---|---|
| `pillow` | US-02 (room type photos) |
| `stripe`, `@stripe/stripe-js`, `@stripe/react-stripe-js` | US-06 |
| `pillow-heif` | US-16 (HEIC evidence) |
| `weasyprint` (+ Pango system libraries in the backend image) | US-17 |
| `cryptography` (Fernet) | US-20 |

## Consequences

* The skeleton installs only what it uses, so the dependency tree stays small until a story needs more.
* An upgrade from Django 5.2 LTS to 6.2 LTS (April 2027) should be planned before April 2028.
* The i18n namespaces are lazy-loaded with a small custom i18next backend (Vite dynamic imports),
  so no i18next backend package is needed.
