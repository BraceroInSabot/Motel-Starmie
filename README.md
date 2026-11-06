# Starmie Motel PMS

Property Management System for the Starmie motels (Bedford and Timberlea, Nova Scotia).
Business rules come only from the user stories in `docs/Initial Requirements/`; technical
conventions are in `docs/Tech Spec/Techinal Specs.md`.

**Phase:** V1 — Python 3.13, Django 5.2 LTS, Poetry, PostgreSQL 16, Docker, pytest,
React 19, TypeScript 6, MantineUI, Django Channels with RabbitMQ.

## Requirements

* Docker with Docker Compose
* For work outside containers: Python 3.13 + Poetry 2.x, Node 22 LTS, `make`

## First run

```bash
cp backend/.env.example backend/.env   # then set DJANGO_SECRET_KEY
make up                   # builds and starts the stack
make migrate              # creates the database tables
```

| URL | What |
|---|---|
| http://localhost | Application (through nginx) |
| http://localhost/api/v1/docs/ | Swagger UI (development only) |
| http://localhost/admin/ | Django admin (technical; `make superuser`) |
| http://localhost:8025 | Mailpit — every email sent in development |
| http://localhost:15672 | RabbitMQ management (guest / guest) |

## Daily commands

Run `make help` for the full list.

| Command | Does |
|---|---|
| `make up` / `make down` | Start / stop the stack |
| `make migrate` | Apply migrations (including seeds) |
| `make test` | Backend (pytest) and front-end (Vitest) tests with coverage |
| `make lint` | ruff, mypy, import-linter, ESLint, Prettier check, `tsc` |
| `make check` | `lint` + `test` — must pass before opening a Pull Request |
| `make schema` | Regenerate the OpenAPI schema (`backend/openapi.yaml`) |
| `make messages` | Extract and compile the backend `.po` files (EN/FR) |

Commands run inside the containers by default. To run them on your machine instead:

```bash
make check BACKEND="cd backend && poetry run" FRONTEND="cd frontend &&"
```

The local `.env` lives in `backend/` (ADR-0004). Backend tests need PostgreSQL; outside Docker, `config.settings.test` uses
`postgres://starmie:starmie@localhost:5432/starmie` unless `DATABASE_URL` is set.

## Layout

```
backend/
  config/            settings (base, dev, test, prod), urls, asgi, crontab
  starmie/<module>/  domain · application · infrastructure · interface · migrations · tests
frontend/
  src/app            router, providers, layout
  src/shared         API client, money and date formatting
  src/i18n           i18next setup and EN/FR locales
  src/features/      one folder per feature (booking, front-desk, housekeeping, ...)
docs/ADR             architecture decision records
nginx/               dev reverse proxy (one origin for the browser)
```

Clean Architecture rules are checked by `import-linter` (`backend/pyproject.toml`): domain and
application layers never import Django, DRF, Channels or Stripe; layers depend inward only.

## Contributing

One story per Pull Request. Before opening it: `make check`, update `CHANGELOG.md` (Unreleased),
the module page in the GitHub Wiki, the EN and FR translations, and add an ADR for any new library
(Technical Specs 5.4 and 5.5).

Install the pre-commit hooks once: `cd backend && poetry run pre-commit install`.
