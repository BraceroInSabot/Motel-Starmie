"""Test settings: safe defaults so pytest runs without a `.env` file.

Defaults are set *before* importing base, because base reads the environment at import time.
Real environment variables still win (e.g. DATABASE_URL in docker-compose).
"""

import os

os.environ.setdefault("DJANGO_SECRET_KEY", "test-only-insecure-secret-key")
os.environ.setdefault("DATABASE_URL", "postgres://starmie:starmie@localhost:5432/starmie")
os.environ.setdefault("RABBITMQ_URL", "amqp://guest:guest@localhost:5672/")

from config.settings.base import *  # noqa: F403

EMAIL_BACKEND = "django.core.mail.backends.locmem.EmailBackend"

PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]

CHANNEL_LAYERS = {"default": {"BACKEND": "channels.layers.InMemoryChannelLayer"}}
