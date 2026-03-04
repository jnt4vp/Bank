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
