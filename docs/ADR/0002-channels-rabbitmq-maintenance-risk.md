# ADR-0002: Keep `channels-rabbitmq` as the Channels layer, with a maintenance risk

* **Status:** Accepted
* **Date:** 2026-11-03
* **Deciders:** Project owner

## Context

The Technical Specs (2.3) and `Tools.md` use RabbitMQ as the Django Channels layer in V1, through
`channels-rabbitmq`. Its latest release is 4.0.1 from October 2022. It still installs and imports with
Channels 4.3 and Python 3.13, but it has had no release for about four years. It also pins
`msgpack < 2.0`.

The alternatives are the officially maintained `channels-redis` (adds Redis, a technology outside
the V1 stack) or writing a small RabbitMQ layer ourselves.

## Decision

Keep `channels-rabbitmq` 4.0.x, as the spec says, and record the risk.

## Consequences

* Tests use `InMemoryChannelLayer` (`config/settings/test.py`), so unit and integration tests do not
  depend on the broker.
* Before US-10 and US-18 (the real-time dashboard and housekeeping board) are marked done, run one
  end-to-end WebSocket test against the RabbitMQ container to confirm group messages work.
* Review this ADR if any of these happens: a Channels, Python or `msgpack` upgrade breaks it; a
  security issue is reported; or the V2 RabbitMQ work (full use) needs features it lacks.
  The fallback is `channels-redis`, which would need a new ADR because it adds Redis to the stack.
