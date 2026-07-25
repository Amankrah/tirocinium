"""Load a local ``.env`` for real runs, never for the test suite.

The model API keys (``TIRO_ANTHROPIC_API_KEY``, ``TIRO_OPENAI_API_KEY``) and any
runtime overrides (model ids, ``TIRO_DATA_DIR``, ``TIRO_REDIS_URL``, the S3 seam)
can live in ``apps/api/.env``, which is gitignored; ``.env.example`` lists the
names with no values (decision 0035). This runs once at package import, so the
API factory, the arq worker, and the maintenance scripts all pick it up before
any client is constructed, but it is skipped when ``TIRO_TESTING`` is set (the
test suite sets it in ``conftest.py``) so a developer's real keys never leak into
a run that uses recorded-response mocks and makes no live call. Real environment
variables always win over the file (python-dotenv's ``override=False`` default),
so a value set in the shell or by the deployment overrides ``.env``.
"""

import os

from dotenv import find_dotenv, load_dotenv


def load_local_env() -> None:
    """Load ``.env`` from the current working directory upward, unless running
    under the test suite. A no-op when no ``.env`` is found."""
    if os.environ.get("TIRO_TESTING"):
        return
    load_dotenv(find_dotenv(usecwd=True))
