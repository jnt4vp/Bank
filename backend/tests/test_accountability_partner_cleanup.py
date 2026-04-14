import os
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

os.environ.setdefault("APP_ENV", "test")
os.environ.setdefault("AUTO_CREATE_TABLES", "false")

from backend.routers.accountability_partners import _prune_partner_references


class _ListResult:
    def __init__(self, items):
        self._items = items

    def scalars(self):
        return self

    def all(self):
        return self._items


class AccountabilityPartnerCleanupTest(unittest.IsolatedAsyncioTestCase):
    async def test_prunes_deleted_partner_id_from_matching_settings(self):
        partner_id = uuid4()
        keep_id = uuid4()
        settings_a = SimpleNamespace(accountability_partner_ids=[str(partner_id), str(keep_id)])
        settings_b = SimpleNamespace(accountability_partner_ids=[str(partner_id)])
        settings_c = SimpleNamespace(accountability_partner_ids=[str(keep_id)])
        db = SimpleNamespace(
            execute=AsyncMock(return_value=_ListResult([settings_a, settings_b, settings_c]))
        )

        pruned = await _prune_partner_references(
            db,
            user_id=uuid4(),
            partner_id=partner_id,
        )

        self.assertEqual(pruned, 2)
        self.assertEqual(settings_a.accountability_partner_ids, [str(keep_id)])
        self.assertEqual(settings_b.accountability_partner_ids, [])
        self.assertEqual(settings_c.accountability_partner_ids, [str(keep_id)])

    async def test_handles_uuid_values_already_loaded_from_json(self):
        partner_id = uuid4()
        keep_id = uuid4()
        settings = SimpleNamespace(accountability_partner_ids=[partner_id, keep_id])
        db = SimpleNamespace(
            execute=AsyncMock(return_value=_ListResult([settings]))
        )

        pruned = await _prune_partner_references(
            db,
            user_id=uuid4(),
            partner_id=partner_id,
        )

        self.assertEqual(pruned, 1)
        self.assertEqual(settings.accountability_partner_ids, [keep_id])
