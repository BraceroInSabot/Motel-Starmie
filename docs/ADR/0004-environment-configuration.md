# ADR-0004: Read environment variables with a small standard-library helper

* **Status:** Accepted
* **Date:** 2026-11-03
* **Deciders:** Project owner

## Context

All configuration comes from environment variables (Technical Specs 2.4), and settings must fail at
start-up when a required variable is missing. Section 6 lists no environment library.

## Decision

Use `config/settings/env.py`: typed helpers (`env_str`, `env_bool`, `env_int`, `env_list`) on top of
`os.environ`, raising `ImproperlyConfigured` for a missing required variable without ever printing a
value. Docker Compose loads `backend/.env` into the backend container (`env_file`); the template is
`backend/.env.example`. The spec (2.1) places `.env.example` at the repository root; the project owner
chose to keep the env files in `backend/`, next to the code that reads them. `config/settings/test.py` sets safe
defaults before importing the base settings, so `pytest` runs without a `.env` file.
`dj-database-url` keeps parsing `DATABASE_URL`.

## Consequences

* No extra dependency.
* Commands run on the host outside Docker need the variables exported first
  (`set -a; source .env; set +a`). If that becomes a frequent need, `django-environ` is the
  replacement (it can also replace `dj-database-url`), with a new ADR.
