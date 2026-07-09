from __future__ import annotations

import argparse
import json
import os
import sys

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.path.dirname(CURRENT_DIR)
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from app.db.session import SessionLocal
from app.services.memory_update_service import normalize_character_entity_duplicates


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Normalize structured memory person/character duplicate entities.")
    parser.add_argument("--project-id", required=True, help="Project ID to normalize.")
    parser.add_argument("--name", action="append", default=[], help="Limit cleanup to a specific entity name. Can be repeated.")
    parser.add_argument("--apply", action="store_true", help="Apply changes. Omit for dry-run.")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    db = SessionLocal()
    try:
        result = normalize_character_entity_duplicates(
            db=db,
            project_id=str(args.project_id).strip(),
            apply=bool(args.apply),
            names=[str(name).strip() for name in args.name or []],
        )
        print(json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True))
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
