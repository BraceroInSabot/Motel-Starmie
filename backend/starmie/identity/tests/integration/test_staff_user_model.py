"""US-01 (partial): login email is unique and case-insensitive. The rest of US-01 is pending."""

import pytest
from django.contrib.auth import authenticate, get_user_model
from django.db import IntegrityError, connection

from starmie.identity.infrastructure.models import StaffUser

pytestmark = pytest.mark.django_db


def test_auth_user_model_is_staff_user() -> None:
    assert get_user_model() is StaffUser


def test_email_is_stored_lower_cased_and_trimmed() -> None:
    user = StaffUser.objects.create_user(" Agent@Starmie.Local ", "a-long-password-123")
    user.refresh_from_db()
    assert user.email == "agent@starmie.local"


def test_email_is_unique_regardless_of_case() -> None:
    StaffUser.objects.create_user("agent@starmie.local", "a-long-password-123")
    with pytest.raises(IntegrityError):
        StaffUser.objects.create_user("AGENT@starmie.local", "a-long-password-123")


def test_database_constraint_blocks_case_variants_written_without_the_model() -> None:
    StaffUser.objects.create_user("agent@starmie.local", "a-long-password-123")
    with pytest.raises(IntegrityError), connection.cursor() as cursor:
        cursor.execute(
            "INSERT INTO identity_staff_user "
            "(id, email, password, is_active, is_staff, is_superuser, date_joined) "
            "VALUES (gen_random_uuid(), 'Agent@Starmie.Local', '', true, false, false, now())"
        )


def test_login_lookup_is_case_insensitive() -> None:
    StaffUser.objects.create_user("agent@starmie.local", "a-long-password-123")
    user = authenticate(username="Agent@STARMIE.local", password="a-long-password-123")
    assert user is not None
    assert user.get_username() == "agent@starmie.local"


def test_primary_key_is_a_uuid() -> None:
    user = StaffUser.objects.create_user("agent@starmie.local", "a-long-password-123")
    assert len(str(user.pk)) == 36


def test_email_is_required() -> None:
    with pytest.raises(ValueError, match="email"):
        StaffUser.objects.create_user("", "a-long-password-123")


def test_superuser_is_a_technical_admin_account() -> None:
    admin = StaffUser.objects.create_superuser("admin@starmie.local", "a-long-password-123")
    assert admin.is_staff is True
    assert admin.is_superuser is True
    assert str(admin) == "admin@starmie.local"


def test_full_clean_normalizes_the_email() -> None:
    user = StaffUser(email="Desk@Starmie.Local")
    user.set_unusable_password()
    user.full_clean()
    assert user.email == "desk@starmie.local"
