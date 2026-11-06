"""Django persistence model for staff accounts.

Scope of this skeleton: only what must exist before the first migration, i.e. the custom
user model with a unique, case-insensitive email as the login (US-01). Roles, property
scope, language (US-24), lockout, must-change-password and the permission matrix are
added by the US-01 story.
"""

import uuid
from typing import Any, ClassVar

from django.contrib.auth.base_user import AbstractBaseUser, BaseUserManager
from django.contrib.auth.models import PermissionsMixin
from django.db import models
from django.db.models.functions import Lower
from django.utils import timezone


def normalize_login_email(email: str) -> str:
    """Emails are compared case-insensitively, so they are stored lower-cased and trimmed."""
    return email.strip().lower()


class StaffUserManager(BaseUserManager["StaffUser"]):
    use_in_migrations = True

    def get_by_natural_key(self, username: str | None) -> "StaffUser":
        return self.get(email__iexact=normalize_login_email(username or ""))

    def create_user(
        self, email: str, password: str | None = None, **extra_fields: Any
    ) -> "StaffUser":
        if not email:
            raise ValueError("An email address is required.")
        user = self.model(email=normalize_login_email(email), **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(
        self, email: str, password: str | None = None, **extra_fields: Any
    ) -> "StaffUser":
        """Technical superuser for Django admin only. The first General Manager is created
        by the US-01 seed, not by this method."""
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        return self.create_user(email, password, **extra_fields)


class StaffUser(AbstractBaseUser, PermissionsMixin):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    email = models.EmailField(max_length=254, unique=True)
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(
        default=False, help_text="Can log into the Django admin site (technical flag)."
    )
    date_joined = models.DateTimeField(default=timezone.now)

    objects: ClassVar[StaffUserManager] = StaffUserManager()

    USERNAME_FIELD = "email"
    EMAIL_FIELD = "email"
    REQUIRED_FIELDS: ClassVar[list[str]] = []

    class Meta:
        db_table = "identity_staff_user"
        constraints: ClassVar = [
            models.UniqueConstraint(Lower("email"), name="identity_staff_user_email_ci_unique"),
        ]

    def clean(self) -> None:
        super().clean()
        self.email = normalize_login_email(self.email)

    def save(self, *args: Any, **kwargs: Any) -> None:
        self.email = normalize_login_email(self.email)
        super().save(*args, **kwargs)

    def __str__(self) -> str:
        return self.email
