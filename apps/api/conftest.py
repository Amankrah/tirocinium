"""Suite-wide test environment: a fixed JWT secret so create_app never
falls back to the per-process random secret (and its warning) in tests that
do not care about auth."""

import os

os.environ.setdefault("TIRO_JWT_SECRET", "test-suite-secret")
