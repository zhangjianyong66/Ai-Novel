from __future__ import annotations

import unittest

from app.services.vector_rag_service import _filter_story_memory_candidates_by_scope


class TestVectorRagStoryMemoryScope(unittest.TestCase):
    def test_filters_story_memory_candidates_by_current_outline_and_project_scope(self) -> None:
        candidates = [
            {"id": "current", "metadata": {"source": "story_memory", "scope": "outline", "outline_id": "o1"}},
            {"id": "project", "metadata": {"source": "story_memory", "scope": "project"}},
            {"id": "other", "metadata": {"source": "story_memory", "scope": "outline", "outline_id": "o2"}},
            {"id": "unassigned", "metadata": {"source": "story_memory", "scope": "unassigned"}},
            {"id": "worldbook", "metadata": {"source": "worldbook"}},
        ]

        kept, dropped = _filter_story_memory_candidates_by_scope(candidates, outline_id="o1")

        self.assertEqual([c["id"] for c in kept], ["current", "project", "worldbook"])
        self.assertEqual(
            dropped,
            [
                {"id": "other", "reason": "story_memory_scope"},
                {"id": "unassigned", "reason": "story_memory_scope"},
            ],
        )


if __name__ == "__main__":
    unittest.main()
