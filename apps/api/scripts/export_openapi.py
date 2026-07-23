"""Regenerate the committed OpenAPI spec: `python scripts/export_openapi.py`.

Run from apps/api after any route or model change, then regenerate the web
client (`pnpm generate:client` in apps/web) and commit both. CI enforces
freshness of both artifacts.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.contract import write_spec

if __name__ == "__main__":
    print(f"wrote {write_spec()}")
