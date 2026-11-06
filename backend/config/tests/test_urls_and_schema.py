import importlib
from pathlib import Path

import pytest
from django.core.management import call_command
from django.test import Client


@pytest.mark.django_db
def test_unknown_api_route_returns_404(client: Client) -> None:
    assert client.get("/api/v1/does-not-exist").status_code == 404


def test_swagger_is_not_mounted_outside_debug(client: Client) -> None:
    assert client.get("/api/v1/docs/").status_code == 404


def test_openapi_schema_can_be_generated(tmp_path: Path) -> None:
    output = tmp_path / "schema.yml"
    call_command("spectacular", "--file", str(output), "--validate", "--fail-on-warn")
    assert "Starmie Motel PMS API" in output.read_text()


def test_production_settings_force_secure_cookies() -> None:
    prod = importlib.import_module("config.settings.prod")
    assert prod.DEBUG is False
    assert prod.SESSION_COOKIE_SECURE is True
    assert prod.CSRF_COOKIE_SECURE is True
    assert prod.SECURE_SSL_REDIRECT is True
