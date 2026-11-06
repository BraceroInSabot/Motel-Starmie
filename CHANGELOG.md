# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- Project skeleton for V1 (Technical Specs sections 2, 4 and 5).
- Backend: Poetry project (Python 3.13, Django 5.2 LTS), split settings (base, dev, test, prod),
  environment helper, DRF, drf-spectacular (Swagger in development), Channels with the RabbitMQ
  layer, Argon2 hashing, 12-hour sessions.
- Backend: Clean Architecture module layout for `shared` and `identity`; `StaffUser` custom user
  model with a unique, case-insensitive email login (first part of US-01).
- Backend quality: ruff, mypy (strict for domain and application), import-linter contracts,
  pytest with an 85% coverage minimum, pre-commit hooks.
- Front end: Vite, React 19, TypeScript 6 (strict), Mantine with the default theme, React Router,
  TanStack Query, i18next with lazy-loaded EN/FR namespaces, API client (session cookie, CSRF,
  problem details), money and date formatting with `Intl`.
- Front-end quality: ESLint (typescript-eslint, react-hooks, jsx-a11y, i18next), Prettier,
  Vitest with a 75% coverage minimum, EN/FR key parity test.
- Docker Compose stack: PostgreSQL 16, RabbitMQ, Mailpit, backend, frontend, nginx.
- Makefile, `backend/.env.example`, ADR-0001 to ADR-0004.
