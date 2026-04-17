"""Tests for backend.services.token_encryption — encrypt/decrypt round-trip."""

import os
import unittest
from unittest.mock import patch
from types import SimpleNamespace

os.environ.setdefault("APP_ENV", "test")
os.environ.setdefault("AUTO_CREATE_TABLES", "false")

# Reset the module-level cached Fernet so our patched settings take effect
import backend.services.token_encryption as _mod
_mod._fernet = None


class TokenEncryptionTest(unittest.TestCase):
    def setUp(self):
        # Reset cached Fernet before each test
        _mod._fernet = None

    @patch(
        "backend.services.token_encryption.get_settings",
        return_value=SimpleNamespace(
            PLAID_TOKEN_KEY="test-encryption-key-1234",
            JWT_SECRET="fallback-secret",
        ),
    )
    def test_round_trip(self, _settings):
        from backend.services.token_encryption import decrypt_token, encrypt_token

        plaintext = "access-sandbox-abc123-plaid-token"
        encrypted = encrypt_token(plaintext)
        self.assertNotEqual(encrypted, plaintext)
        decrypted = decrypt_token(encrypted)
        self.assertEqual(decrypted, plaintext)

    @patch(
        "backend.services.token_encryption.get_settings",
        return_value=SimpleNamespace(
            PLAID_TOKEN_KEY="",
            JWT_SECRET="fallback-jwt-secret-key",
        ),
    )
    def test_falls_back_to_jwt_secret(self, _settings):
        _mod._fernet = None
        from backend.services.token_encryption import decrypt_token, encrypt_token

        encrypted = encrypt_token("token-xyz")
        decrypted = decrypt_token(encrypted)
        self.assertEqual(decrypted, "token-xyz")

    @patch(
        "backend.services.token_encryption.get_settings",
        return_value=SimpleNamespace(
            PLAID_TOKEN_KEY="key-a",
            JWT_SECRET="fallback",
        ),
    )
    def test_different_key_fails_decrypt(self, _settings):
        from backend.services.token_encryption import encrypt_token

        encrypted = encrypt_token("secret")

        # Change key
        _mod._fernet = None
        with patch(
            "backend.services.token_encryption.get_settings",
            return_value=SimpleNamespace(
                PLAID_TOKEN_KEY="key-b-different",
                JWT_SECRET="fallback",
            ),
        ):
            from backend.services.token_encryption import decrypt_token
            with self.assertRaises(Exception):
                decrypt_token(encrypted)

    @patch(
        "backend.services.token_encryption.get_settings",
        return_value=SimpleNamespace(
            PLAID_TOKEN_KEY="test-key",
            JWT_SECRET="fallback",
        ),
    )
    def test_encrypted_output_is_url_safe_base64(self, _settings):
        from backend.services.token_encryption import encrypt_token

        encrypted = encrypt_token("some-plaid-token")
        # Fernet tokens are URL-safe base64
        import re
        self.assertTrue(re.match(r'^[A-Za-z0-9_\-=]+$', encrypted))

    def tearDown(self):
        _mod._fernet = None


if __name__ == "__main__":
    unittest.main()
