"""Root URL configuration. Every API route lives under /api/v1 (Technical Specs 1.1)."""

from django.conf import settings
from django.contrib import admin
from django.urls import URLPattern, URLResolver, include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

api_v1_patterns: list[URLPattern | URLResolver] = []

if settings.DEBUG:
    api_v1_patterns += [
        path("schema/", SpectacularAPIView.as_view(), name="schema"),
        path("docs/", SpectacularSwaggerView.as_view(url_name="schema"), name="swagger-ui"),
    ]

urlpatterns: list[URLPattern | URLResolver] = [
    path("admin/", admin.site.urls),
    path("api/v1/", include(api_v1_patterns)),
]
