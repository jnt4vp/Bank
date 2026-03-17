"""Symmetric encryption for sensitive tokens stored at rest (e.g. Plaid access tokens).

Uses Fernet (AES-128-CBC + HMAC-SHA256) from the cryptography library,
which is already an indirect dependency via python-jose[cryptography].
"""

import base64
import hashlib

from cryptography.fernet import Fernet

from ..config import get_settings

_fernet: Fernet | None = None


def _get_fernet() -> Fernet:
    global _fernet
    if _fernet is None:
        settings = get_settings()
        # Derive a 32-byte key from the configured secret.
        # PLAID_TOKEN_KEY is preferred; falls back to JWT_SECRET for dev convenience.
        raw_key = settings.PLAID_TOKEN_KEY or settings.JWT_SECRET
        key_bytes = hashlib.sha256(raw_key.encode()).digest()
        _fernet = Fernet(base64.urlsafe_b64encode(key_bytes))
    return _fernet


def encrypt_token(plaintext: str) -> str:
    """Encrypt a plaintext token and return a URL-safe base64 string."""
    return _get_fernet().encrypt(plaintext.encode()).decode()


def decrypt_token(ciphertext: str) -> str:
    """Decrypt a previously encrypted token."""
    return _get_fernet().decrypt(ciphertext.encode()).decode()
