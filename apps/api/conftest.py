"""Suite-wide test environment: a fixed JWT secret so create_app never
falls back to the per-process random secret (and its warning) in tests that
do not care about auth, and the TIRO_TESTING flag so importing the app never
loads a developer's local .env (decision 0035); tests use recorded mocks and
must not depend on real keys or a real broker."""

import os

os.environ["TIRO_TESTING"] = "1"
os.environ.setdefault("TIRO_JWT_SECRET", "test-suite-secret-0123456789abcdef")
