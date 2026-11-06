import pytest
from django.core.exceptions import ImproperlyConfigured

from config.settings.env import env_bool, env_int, env_list, env_str


class TestEnvStr:
    def test_returns_trimmed_value(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("STARMIE_TEST_VAR", "  value  ")
        assert env_str("STARMIE_TEST_VAR") == "value"

    def test_missing_required_variable_fails_start_up(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.delenv("STARMIE_TEST_VAR", raising=False)
        with pytest.raises(ImproperlyConfigured, match="STARMIE_TEST_VAR"):
            env_str("STARMIE_TEST_VAR")

    def test_blank_value_counts_as_missing(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("STARMIE_TEST_VAR", "   ")
        assert env_str("STARMIE_TEST_VAR", "fallback") == "fallback"

    def test_error_message_never_contains_the_value(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("STARMIE_TEST_INT", "secret-not-a-number")
        with pytest.raises(ImproperlyConfigured) as exc_info:
            env_int("STARMIE_TEST_INT")
        assert "secret-not-a-number" not in str(exc_info.value)


class TestEnvBool:
    @pytest.mark.parametrize("raw", ["1", "true", "TRUE", "yes", "on"])
    def test_true_values(self, monkeypatch: pytest.MonkeyPatch, raw: str) -> None:
        monkeypatch.setenv("STARMIE_TEST_BOOL", raw)
        assert env_bool("STARMIE_TEST_BOOL") is True

    @pytest.mark.parametrize("raw", ["0", "false", "no", "off"])
    def test_false_values(self, monkeypatch: pytest.MonkeyPatch, raw: str) -> None:
        monkeypatch.setenv("STARMIE_TEST_BOOL", raw)
        assert env_bool("STARMIE_TEST_BOOL") is False

    def test_invalid_value_fails(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("STARMIE_TEST_BOOL", "maybe")
        with pytest.raises(ImproperlyConfigured):
            env_bool("STARMIE_TEST_BOOL")

    def test_default_when_missing(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.delenv("STARMIE_TEST_BOOL", raising=False)
        assert env_bool("STARMIE_TEST_BOOL", False) is False

    def test_missing_required(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.delenv("STARMIE_TEST_BOOL", raising=False)
        with pytest.raises(ImproperlyConfigured):
            env_bool("STARMIE_TEST_BOOL")


class TestEnvInt:
    def test_parses_integer(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("STARMIE_TEST_INT", "1025")
        assert env_int("STARMIE_TEST_INT") == 1025

    def test_default_when_missing(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.delenv("STARMIE_TEST_INT", raising=False)
        assert env_int("STARMIE_TEST_INT", 587) == 587

    def test_missing_required(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.delenv("STARMIE_TEST_INT", raising=False)
        with pytest.raises(ImproperlyConfigured):
            env_int("STARMIE_TEST_INT")


class TestEnvList:
    def test_splits_and_trims_comma_separated_values(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("STARMIE_TEST_LIST", "localhost, 127.0.0.1 ,,")
        assert env_list("STARMIE_TEST_LIST") == ["localhost", "127.0.0.1"]

    def test_default_is_copied(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.delenv("STARMIE_TEST_LIST", raising=False)
        default = ["localhost"]
        result = env_list("STARMIE_TEST_LIST", default)
        result.append("other")
        assert default == ["localhost"]

    def test_missing_required(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.delenv("STARMIE_TEST_LIST", raising=False)
        with pytest.raises(ImproperlyConfigured):
            env_list("STARMIE_TEST_LIST")
