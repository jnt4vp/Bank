import os
import unittest

os.environ.setdefault("APP_ENV", "test")
os.environ.setdefault("AUTO_CREATE_TABLES", "false")

from backend.security import PasswordValidationError, hash_password, verify_password


class SecurityTest(unittest.TestCase):
    def test_hash_password_rejects_short_passwords(self):
        with self.assertRaises(PasswordValidationError) as exc:
            hash_password("short")

        self.assertEqual(str(exc.exception), "Password must be at least 8 characters")

    def test_hash_password_rejects_passwords_over_bcrypt_limit(self):
        with self.assertRaises(PasswordValidationError) as exc:
            hash_password("x" * 73)

        self.assertEqual(str(exc.exception), "Password must be 72 bytes or less.")

    def test_verify_password_returns_false_for_passwords_over_bcrypt_limit(self):
        hashed = hash_password("Password123!")
        self.assertFalse(verify_password("x" * 73, hashed))
