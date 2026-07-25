"""Activate a new mastery parameter version and replay every course shard
under it (mastery spec section 10, milestone 6.3).

Usage, from apps/api:

    .venv/Scripts/python scripts/migrate_mastery_params.py path/to/params.json

The file is the full parameter set as JSON and must carry a unique "version".
State is a cache; the event log plus this version is the truth, so the replay
recomputes every cached (seat, concept) and records the version on each row.
Run it in a maintenance window; each course replays inside one writer
transaction.
"""

import asyncio
import json
import sys
from pathlib import Path

from app.db.shards import ShardManager
from app.mastery.params import activate_and_replay_all


async def main(params_path: str) -> None:
    params_json = Path(params_path).read_text(encoding="utf-8")
    version = json.loads(params_json)["version"]
    data_dir = Path(__import__("os").environ.get("TIRO_DATA_DIR", "data"))
    async with ShardManager(data_dir) as shards:
        counts = await activate_and_replay_all(shards, params_json)
    print(
        f"activated {version}: replayed {counts['states']} states"
        f" across {counts['courses']} courses"
    )


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(__doc__)
        raise SystemExit(2)
    asyncio.run(main(sys.argv[1]))
