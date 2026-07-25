"""Tirocinium API application package.

Phase 0.3 establishes the skeleton and the contract pipeline; the real
modules (auth, courses, generation, submissions, retrieval — backend guide
section 2) land phase by phase.
"""

from app.env import load_local_env

# Load apps/api/.env for real runs (keys, overrides), skipped under the test
# suite so recorded-response tests never pick up developer secrets (decision 0035).
load_local_env()
