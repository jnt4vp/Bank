import os
import unittest
from pathlib import Path

os.environ.setdefault("APP_ENV", "test")
os.environ.setdefault("AUTO_CREATE_TABLES", "false")

from backend.config import Settings


def _read_env_example_keys() -> set[str]:
    env_example_path = Path(__file__).resolve().parents[2] / ".env.example"
    keys: set[str] = set()

    for raw_line in env_example_path.read_text().splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue

        key, _value = line.split("=", 1)
        keys.add(key.strip())

    return keys


class ConfigSurfaceTest(unittest.TestCase):
    def test_env_example_matches_settings_fields(self):
        example_keys = _read_env_example_keys()
        settings_keys = set(Settings.model_fields.keys())

        self.assertEqual(example_keys, settings_keys)
