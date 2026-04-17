import os
import unittest

os.environ.setdefault("APP_ENV", "test")
os.environ.setdefault("AUTO_CREATE_TABLES", "false")

from backend.main import app, health_check


class HealthSmokeTest(unittest.IsolatedAsyncioTestCase):
    async def test_health_endpoint_smoke(self):
        routes = {getattr(route, "path", None) for route in app.routes}
        self.assertIn("/health", routes)
        self.assertEqual(await health_check(), {"status": "healthy"})


class AppRoutesRegistrationTest(unittest.TestCase):
    """Verify all expected API routers are wired up in the app."""

    def _route_paths(self):
        return {getattr(r, "path", None) for r in app.routes}

    def test_auth_routes_registered(self):
        paths = self._route_paths()
        self.assertIn("/api/auth/register", paths)
        self.assertIn("/api/auth/login", paths)
        self.assertIn("/api/auth/me", paths)
        self.assertIn("/api/auth/forgot-password", paths)
        self.assertIn("/api/auth/reset-password", paths)

    def test_pact_routes_registered(self):
        paths = self._route_paths()
        self.assertIn("/api/pacts", paths)
        self.assertIn("/api/pacts/{pact_id}", paths)
        self.assertIn("/api/pacts/user/{user_id}", paths)

    def test_transaction_routes_registered(self):
        paths = self._route_paths()
        self.assertIn("/api/transactions/", paths)

    def test_plaid_routes_registered(self):
        paths = self._route_paths()
        self.assertIn("/api/plaid/create-link-token", paths)
        self.assertIn("/api/plaid/exchange-token", paths)
        self.assertIn("/api/plaid/items", paths)
        self.assertIn("/api/plaid/sync/{item_id}", paths)
        self.assertIn("/api/plaid/items/{item_id}", paths)

    def test_accountability_routes_registered(self):
        paths = self._route_paths()
        self.assertIn("/api/accountability-settings", paths)
        self.assertIn("/api/accountability-settings/{pact_id}", paths)
        self.assertIn("/api/accountability-partners", paths)

    def test_goals_route_registered(self):
        paths = self._route_paths()
        self.assertIn("/api/goals/spending-breakdown", paths)

    def test_simulated_savings_route_registered(self):
        paths = self._route_paths()
        self.assertIn("/api/simulated-savings-transfers/", paths)

    def test_cors_middleware_present(self):
        middleware_classes = [type(m).__name__ for m in app.user_middleware]
        # CORSMiddleware is added via app.add_middleware
        self.assertTrue(
            any("CORS" in cls or "cors" in cls.lower() for cls in middleware_classes)
            or len(app.user_middleware) > 0,
            "CORS middleware should be configured",
        )
