from django.apps import AppConfig


class IdentityConfig(AppConfig):
    """Staff accounts, sessions and the permission matrix (US-01, US-24)."""

    name = "starmie.identity"
    label = "identity"
    verbose_name = "Identity"
