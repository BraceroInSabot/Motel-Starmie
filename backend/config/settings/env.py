"""Typed access to environment variables (12-factor, Technical Specs 2.4).

Docker Compose loads `.env` into the container; this module only reads and validates.
A required variable that is missing stops the start-up. Values are never logged.
"""

import os
from typing import Final

from django.core.exceptions import ImproperlyConfigured


class _Missing:
    """Sentinel type for 'no default given' (the variable is required)."""


_REQUIRED: Final = _Missing()
_TRUE_VALUES: Final = frozenset({"1", "true", "yes", "on"})
_FALSE_VALUES: Final = frozenset({"0", "false", "no", "off"})


def _raw(name: str) -> str | None:
    value = os.environ.get(name)
    if value is None or value.strip() == "":
        return None
    return value.strip()


def _missing(name: str) -> ImproperlyConfigured:
    return ImproperlyConfigured(f"Missing required environment variable: {name}")


def env_str(name: str, default: str | _Missing = _REQUIRED) -> str:
    value = _raw(name)
    if value is not None:
        return value
    if isinstance(default, _Missing):
        raise _missing(name)
    return default


def env_bool(name: str, default: bool | _Missing = _REQUIRED) -> bool:
    value = _raw(name)
    if value is None:
        if isinstance(default, _Missing):
            raise _missing(name)
        return default
    lowered = value.lower()
    if lowered in _TRUE_VALUES:
        return True
    if lowered in _FALSE_VALUES:
        return False
    raise ImproperlyConfigured(f"Environment variable {name} must be a boolean")


def env_int(name: str, default: int | _Missing = _REQUIRED) -> int:
    value = _raw(name)
    if value is None:
        if isinstance(default, _Missing):
            raise _missing(name)
        return default
    try:
        return int(value)
    except ValueError as exc:
        raise ImproperlyConfigured(f"Environment variable {name} must be an integer") from exc


def env_list(name: str, default: list[str] | _Missing = _REQUIRED) -> list[str]:
    value = _raw(name)
    if value is None:
        if isinstance(default, _Missing):
            raise _missing(name)
        return list(default)
    return [item.strip() for item in value.split(",") if item.strip()]
