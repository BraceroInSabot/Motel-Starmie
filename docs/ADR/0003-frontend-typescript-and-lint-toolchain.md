# ADR-0003: TypeScript 6.0 with ESLint 9 for the front end

* **Status:** Accepted
* **Date:** 2026-11-03
* **Deciders:** Project owner

## Context

The current Vite React template ships TypeScript 7 and `oxlint`. The Technical Specs (5.2) require
ESLint with `typescript-eslint` (recommended), `react-hooks`, `jsx-a11y` and the
`i18next/no-literal-string` rule. On 2026-11-03:

* `typescript-eslint` 8.x supports TypeScript `>=4.8.4 <6.1.0`, not TypeScript 7;
* `eslint-plugin-jsx-a11y` supports ESLint up to 9.

## Decision

Use TypeScript `~6.0` and ESLint 9 with `typescript-eslint` (type-checked recommended rules),
`eslint-plugin-react-hooks`, `eslint-plugin-jsx-a11y`, `eslint-plugin-i18next` and
`eslint-config-prettier`. `oxlint` is not used.

## Consequences

* The spec's lint rules apply exactly as written, including the i18n literal-string rule.
* Move to TypeScript 7 (and ESLint 10) once `typescript-eslint` and `jsx-a11y` support them; that
  upgrade updates this ADR.
