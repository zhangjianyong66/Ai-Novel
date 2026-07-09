import unittest

from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.base import Base
from app.models.project import Project
from app.models.prompt_block import PromptBlock
from app.models.prompt_preset import PromptPreset
from app.models.user import User
from app.services.prompt_preset_resources import load_preset_resource
from app.services.prompt_presets import _ensure_default_preset_from_resource


class TestPromptPresetResources(unittest.TestCase):
    def test_builtin_resources_load_and_validate(self) -> None:
        keys = [
            "plan_chapter_v1",
            "post_edit_v1",
            "content_optimize_v1",
            "outline_generate_v3",
            "chapter_generate_v3",
            "chapter_analyze_v1",
            "chapter_rewrite_v1",
        ]

        for key in keys:
            res = load_preset_resource(key)
            self.assertEqual(res.key, key)
            self.assertTrue(res.name)
            self.assertGreater(res.version, 0)
            self.assertGreater(len(res.blocks), 0)

    def test_builtin_post_processing_categories_are_readable_chinese(self) -> None:
        expected_categories = {
            "post_edit_v1": "润色",
            "content_optimize_v1": "正文优化",
        }

        for key, expected_category in expected_categories.items():
            res = load_preset_resource(key)
            self.assertEqual(res.category, expected_category)

    def test_outline_default_prompt_requires_named_character_payoff(self) -> None:
        res = load_preset_resource("outline_generate_v3")
        blocks = {block.identifier: block.template for block in res.blocks}

        role_template = blocks["sys.outline.role"]
        contract_template = blocks["sys.outline.contract.json"]

        self.assertIn("命名即承诺", role_template)
        self.assertIn("不要为了单章刺激、单章互动或气氛烘托随意新增有名有姓的人物", role_template)
        self.assertIn("如果某人物只在一章出现", role_template)
        self.assertIn("人物功能表", contract_template)
        self.assertIn("后续出现/影响", contract_template)
        self.assertIn("退场或回收方式", contract_template)

    def test_memory_update_default_prompt_declares_entity_type_rules_and_existing_entities(self) -> None:
        res = load_preset_resource("memory_update_v1")
        blocks = {block.identifier: block.template for block in res.blocks}

        contract_template = blocks["sys.memory_update.contract.json"]
        user_template = blocks["user.memory_update.inputs"]

        self.assertIn("人物统一使用 character", contract_template)
        self.assertIn("不要输出 person", contract_template)
        self.assertIn("existing_entities", user_template)
        self.assertIn("{{existing_entities_json}}", user_template)


class TestPromptPresetDefaultCategoryRepair(unittest.TestCase):
    def setUp(self) -> None:
        engine = create_engine(
            "sqlite:///:memory:",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        self.addCleanup(engine.dispose)
        Base.metadata.create_all(
            engine,
            tables=[
                User.__table__,
                Project.__table__,
                PromptPreset.__table__,
                PromptBlock.__table__,
            ],
        )
        self.SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
        with self.SessionLocal() as db:
            db.add(User(id="u1", display_name="owner"))
            db.add(Project(id="p1", owner_user_id="u1", name="Project 1", genre=None, logline=None))
            db.commit()

    def test_ensure_default_preset_repairs_known_mojibake_category(self) -> None:
        cases = [
            ("post_edit_v1", "娑﹁壊", "润色"),
            ("content_optimize_v1", "姝ｆ枃浼樺寲", "正文优化"),
        ]

        with self.SessionLocal() as db:
            for resource_key, mojibake_category, expected_category in cases:
                preset = _ensure_default_preset_from_resource(db, project_id="p1", resource_key=resource_key, activate=True)
                preset.category = mojibake_category
                db.commit()

                repaired = _ensure_default_preset_from_resource(
                    db,
                    project_id="p1",
                    resource_key=resource_key,
                    activate=True,
                )

                self.assertEqual(repaired.category, expected_category)

                persisted_category = db.execute(
                    select(PromptPreset.category).where(PromptPreset.id == repaired.id)
                ).scalar_one()
                self.assertEqual(persisted_category, expected_category)


if __name__ == "__main__":
    unittest.main()
