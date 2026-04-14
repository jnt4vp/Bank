import os
import unittest

from starlette.routing import Match

os.environ.setdefault("APP_ENV", "test")
os.environ.setdefault("AUTO_CREATE_TABLES", "false")

from backend.main import app


def _full_matches(path: str, method: str) -> list[str]:
    scope = {
        "type": "http",
        "path": path,
        "method": method,
        "root_path": "",
        "scheme": "http",
        "query_string": b"",
        "headers": [],
    }
    matched_paths: list[str] = []
    for route in app.router.routes:
        route_path = getattr(route, "path", None)
        if not route_path or "accountability-partners" not in route_path:
            continue
        match, _child_scope = route.matches(scope)
        if match is Match.FULL:
            matched_paths.append(route_path)
    return matched_paths


class AccountabilityPartnerRoutingTest(unittest.TestCase):
    def test_settings_put_only_matches_settings_route(self):
        self.assertEqual(
            _full_matches("/api/accountability-partners/settings", "PUT"),
            ["/api/accountability-partners/settings"],
        )

    def test_uuid_put_only_matches_partner_update_route(self):
        self.assertEqual(
            _full_matches(
                "/api/accountability-partners/00000000-0000-0000-0000-000000000001",
                "PUT",
            ),
            ["/api/accountability-partners/{partner_id:uuid}"],
        )
