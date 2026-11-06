"""Django discovers models through `<app>.models`; the real models live in the infrastructure
layer (Technical Specs 2.2)."""

from starmie.identity.infrastructure.models import StaffUser

__all__ = ["StaffUser"]
