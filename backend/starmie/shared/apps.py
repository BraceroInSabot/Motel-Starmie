from django.apps import AppConfig


class SharedConfig(AppConfig):
    """Cross-cutting building blocks: Money, Clock, domain events, audit log, problem handler."""

    name = "starmie.shared"
    label = "shared"
    verbose_name = "Shared kernel"
