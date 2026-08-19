"""A standalone attempt to reproduce the intermittent segfault without pytest.

Decision 0065 narrowed the crash to the collector walking a graph built by
FastAPI route and dependency construction and pydantic schema building, and left
this as the next step: if that neighbourhood alone can be made to crash with no
pytest in the picture, the result is a minimal upstream reproducer against
pydantic-core or FastAPI; if it cannot, then pytest's own machinery is part of
the trigger and its `unraisablehook` (which calls `repr()` on an object whose
finaliser has just raised) is the next thing to look at.

Decision 0056 built two harnesses that did not reproduce, in 12 and 14 runs, and
concluded the trigger needed the real suite's scale. Two things have changed
since. The rate is now known to be about 7.5%, so 12 runs had a 39% chance of
finding nothing and proved much less than it appeared to. And the amplifier
exists: forcing many collections raises the rate about fourfold, which is what
makes a harness this size worth running at all.

This one differs from those in using the *real* application factory, so the
route table, the dependency trees, and every response model are the ones the
suite builds, rather than a representative imitation.

    .venv/bin/python scripts/gc_repro.py --help
    .venv/bin/python scripts/gc_repro.py --apps 400

It exits 0 when it survives. A crash is a signal, so measure it the way decision
0057 insists: by exit status (139), never by grepping the output.

The knobs exist so a positive result can be minimised. Start with everything on,
which is the closest thing to the suite; then take away the client, then the
OpenAPI generation, and see what the crash still needs.
"""

import argparse
import gc
import os
import sys
import tempfile
from pathlib import Path

# Match the suite's environment before the app package is imported: conftest.py
# sets TIRO_TESTING so load_local_env() is a no-op (decision 0035). Without it a
# developer's .env would be read here and this harness would differ from the
# thing it is trying to reproduce.
os.environ["TIRO_TESTING"] = "1"
os.environ.setdefault("TIRO_JWT_SECRET", "gc-repro-secret-0123456789abcdef")

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.main import create_app


def build_once(
    data_dir: Path, *, with_openapi: bool, with_client: bool, collections: int
) -> None:
    """One app's worth of churn: construct it, optionally generate its OpenAPI
    document, optionally drive a request through it, then collect hard.

    Each of the three is on a crashing stack in decision 0065: construction
    reaches `_populate_api_route_state` and the pydantic `TypeAdapter` build,
    the OpenAPI document reaches `get_openapi` and `get_flat_dependant`, and a
    request reaches route matching, which is `from_api_route` again.
    """
    app = create_app(data_dir=data_dir)

    if with_openapi:
        app.openapi()

    if with_client:
        from fastapi.testclient import TestClient

        with TestClient(app) as client:
            client.get("/api/v1/health")

    # The application is dropped here; what follows is the collector walking
    # whatever it left behind, which is the moment the suite dies in.
    del app
    for _ in range(collections):
        gc.collect()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--apps",
        type=int,
        default=400,
        help="how many applications to build (the suite builds roughly this many)",
    )
    parser.add_argument(
        "--collections",
        type=int,
        default=5,
        help="forced collections after each application (the amplifier's lever)",
    )
    parser.add_argument("--no-openapi", action="store_true")
    parser.add_argument("--no-client", action="store_true")
    parser.add_argument("--quiet", action="store_true")
    args = parser.parse_args(argv)

    with tempfile.TemporaryDirectory(prefix="gc-repro-") as tmp:
        data_dir = Path(tmp)
        for index in range(args.apps):
            build_once(
                data_dir,
                with_openapi=not args.no_openapi,
                with_client=not args.no_client,
                collections=args.collections,
            )
            if not args.quiet and index % 50 == 0:
                print(f"  {index}/{args.apps}", flush=True)

    if not args.quiet:
        print(f"survived {args.apps} applications")
    return 0


if __name__ == "__main__":
    sys.exit(main())
