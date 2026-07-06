# 实施计划

## Checklist

1. 在 `backend/app/services/import_export_service.py` 引入 `ChapterVersion` 模型。
2. 导出阶段查询当前项目所有 `ChapterVersion`，按 `chapter_id` 和 `created_at` 稳定排序。
3. 在 `chapters` 导出条目中加入 `active_version_id`。
4. 新增顶层 `chapter_versions` 导出 section，写出版本字段。
5. 在 `story_memory.memories` 导出条目中加入 `scope` 和 `outline_id`。
6. 导入阶段在章节创建后导入 `chapter_versions`，维护 `chapter_version_id_map`。
7. 版本导入完成后，二次映射并写回各章节的 `active_version_id`。
8. 导入剧情记忆时恢复并规范化 `scope/outline_id`。
9. 更新 `backend/tests/test_project_bundle_roundtrip.py`：加入 `ChapterVersion` 表、种子数据和断言。
10. 运行后端项目包相关测试。

## Validation Commands

```bash
cd backend && python -m pytest tests/test_project_bundle_roundtrip.py tests/test_project_bundle_routes.py
```

如果当前环境缺少 `pytest`，改用项目可用解释器验证能运行的单测，并在结果中说明阻塞。

## Rollback Points

- 所有行为集中在 `backend/app/services/import_export_service.py` 和项目包 roundtrip 测试，回滚范围明确。
- 不涉及 Alembic 迁移；使用现有模型字段和表。
- 不修改生产数据，只影响新导出的 bundle 和后续导入结果。

