"""Guards the security-relevant settings that the Technical Specs fix (1.8)."""

from config.settings import base


def test_argon2_is_the_first_password_hasher() -> None:
    assert base.PASSWORD_HASHERS[0] == "django.contrib.auth.hashers.Argon2PasswordHasher"


def test_password_minimum_length_is_12() -> None:
    validators = {v["NAME"]: v.get("OPTIONS", {}) for v in base.AUTH_PASSWORD_VALIDATORS}
    min_length = validators["django.contrib.auth.password_validation.MinimumLengthValidator"]
    assert min_length == {"min_length": 12}
    assert "django.contrib.auth.password_validation.CommonPasswordValidator" in validators


def test_session_lasts_12_hours_and_is_not_extended_by_activity() -> None:
    assert base.SESSION_COOKIE_AGE == 12 * 60 * 60
    assert base.SESSION_SAVE_EVERY_REQUEST is False
    assert base.SESSION_COOKIE_HTTPONLY is True
    assert base.SESSION_COOKIE_SAMESITE == "Lax"


def test_timestamps_are_stored_in_utc() -> None:
    assert base.USE_TZ is True
    assert base.TIME_ZONE == "UTC"


def test_only_english_and_french_are_supported() -> None:
    assert [code for code, _ in base.LANGUAGES] == ["en", "fr"]


def test_api_uses_session_authentication_only() -> None:
    assert base.REST_FRAMEWORK["DEFAULT_AUTHENTICATION_CLASSES"] == [
        "rest_framework.authentication.SessionAuthentication",
    ]
