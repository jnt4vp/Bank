"""In-memory sliding-window rate limiter for auth endpoints.

Keyed by client IP. No external dependency (Redis, etc.) — suitable for
single-process deployments. For multi-process / multi-node, swap this for
a shared store.
"""

import time
from collections import defaultdict
from threading import Lock

from fastapi import HTTPException, Request, status


class _SlidingWindowCounter:
    """Thread-safe per-key sliding window counter."""

    def __init__(self, max_requests: int, window_seconds: int):
        self._max = max_requests
        self._window = window_seconds
        self._hits: dict[str, list[float]] = defaultdict(list)
        self._lock = Lock()

    def check(self, key: str) -> None:
        now = time.monotonic()
        cutoff = now - self._window
        with self._lock:
            timestamps = self._hits[key]
            # Prune expired entries
            self._hits[key] = [t for t in timestamps if t > cutoff]
            if len(self._hits[key]) >= self._max:
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail="Too many requests. Please try again later.",
                )
            self._hits[key].append(now)


# 10 requests per 60 seconds per IP for auth endpoints
_auth_limiter = _SlidingWindowCounter(max_requests=10, window_seconds=60)


async def rate_limit_auth(request: Request) -> None:
    """FastAPI dependency that rate-limits by client IP."""
    client_ip = request.client.host if request.client else "unknown"
    _auth_limiter.check(client_ip)
