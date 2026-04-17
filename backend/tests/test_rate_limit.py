"""Tests for the auth rate limiter."""

import os
import unittest
from types import SimpleNamespace

os.environ.setdefault("APP_ENV", "test")
os.environ.setdefault("AUTO_CREATE_TABLES", "false")

from fastapi import HTTPException

from backend.dependencies.rate_limit import _SlidingWindowCounter, rate_limit_auth


class SlidingWindowCounterTest(unittest.TestCase):
    def test_allows_requests_within_limit(self):
        limiter = _SlidingWindowCounter(max_requests=3, window_seconds=60)
        # Should not raise for first 3 requests
        limiter.check("ip-1")
        limiter.check("ip-1")
        limiter.check("ip-1")

    def test_blocks_requests_over_limit(self):
        limiter = _SlidingWindowCounter(max_requests=2, window_seconds=60)
        limiter.check("ip-1")
        limiter.check("ip-1")
        with self.assertRaises(HTTPException) as ctx:
            limiter.check("ip-1")
        self.assertEqual(ctx.exception.status_code, 429)

    def test_separate_keys_have_separate_limits(self):
        limiter = _SlidingWindowCounter(max_requests=1, window_seconds=60)
        limiter.check("ip-1")
        # Different key should still work
        limiter.check("ip-2")
        # Original key should be blocked
        with self.assertRaises(HTTPException):
            limiter.check("ip-1")


class RateLimitAuthTest(unittest.IsolatedAsyncioTestCase):
    async def test_extracts_client_ip(self):
        request = SimpleNamespace(client=SimpleNamespace(host="127.0.0.1"))
        # Should not raise under normal conditions
        await rate_limit_auth(request)

    async def test_handles_missing_client(self):
        request = SimpleNamespace(client=None)
        await rate_limit_auth(request)


if __name__ == "__main__":
    unittest.main()
