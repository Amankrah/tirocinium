# Handoff: the journey-one E2E seed helper

**Status: done** (backend session, decision 0064). The seeder is
`apps/api/scripts/seed_e2e.py` with its test beside it, and the `e2e` job in
`ci.yml` runs it. It grew past what is specified below, because journeys five,
six, mode C, and the defence need state this document did not anticipate: it
prints ten values rather than four (adding `course_id`, `case_study_id`,
`variant_id`, `flagged_case_study_id`, `import_id`, and
`defence_submission_id`). The professor email is at `example.com` rather than
the `.test` this document's spirit suggested, because pydantic's `EmailStr`
refuses special-use TLDs and a seeded professor at a `.test` address writes into
the shard happily and then cannot sign in. Everything else below held.
See `seeded-journeys-first-run.md` for what the journeys found once they ran.

From the frontend session to the backend session. Journey one now runs end to
end through the real UI (professor signs in, opens a course, writes a case study
with typeset math, and publishes it; then a seat redeems a code, opens the same
course, and reads the case). The Playwright spec is
`apps/web/e2e/journey-one.spec.ts`; it skips unless four environment values are
present. It was proven green locally on desktop and mobile against a hand-run
throwaway seeder. What is missing is the committed, gated version of that seeder
and the CI job that runs the journey. Both belong with the backend, because the
seeder writes shards through the same migrations and hashing the API uses and so
must sit under the ruff and mypy gate, and because seat codes are a backend
credential that only the backend should know how to mint.

This document specifies exactly what to build. A working, disposable reference
already exists at `apps/api/data/seed_journey_one.py` (gitignored); treat it as a
sketch, not the deliverable.

## What the seeder seeds, and what it must not

Seed only what has no UI: one professor account, one course they own, and one
active seat scoped to that course. Do not seed the case study. The test authors
and publishes the case study through the UI on purpose, since exercising that is
the whole point of running the professor half through the browser. (This is the
one real difference from the older `apps/api/data/seed_e2e.py`, which seeded a
published case and is now obsolete.)

Two properties matter and are easy to get wrong:

- The professor password must be a real Argon2id hash of a known plaintext, via
  `app.auth.passwords.hash_password`, so the UI sign-in actually succeeds. Do not
  reuse `DUMMY_HASH`; the old throwaway did, which was fine only because the old
  journey never signed in.
- The seat code is minted without object storage. The generation route uploads
  CSV and PDF artifacts to MinIO, which CI should not need. Insert the seat row
  directly (a `generate_code`, `normalize_code`, `hash_code`, `code_prefix`
  quartet from `app.seats.codes`) and print the plaintext once. This is the only
  place the plaintext ever appears, matching the product rule.

The rows, for reference, are a `users` insert (role `professor`), a `courses`
insert with `owner_id` set to the new user, and a `seats` insert with
`status = 'active'` and `seat_number = 'S-001'`. The course content shard is not
touched: it is created lazily by the API when the professor authors through the
UI.

## Interface

Put it at `apps/api/scripts/seed_e2e.py`, beside `export_openapi.py` and the
other maintenance scripts, so it is importable as `scripts.seed_e2e` (the
package already has `__init__.py`) and runnable as
`.venv/bin/python scripts/seed_e2e.py`. It writes into `$TIRO_DATA_DIR` (the same
variable the app reads), defaulting to `data`.

Emit exactly one line of JSON to stdout on success, nothing else, so a CI step
can parse it without scraping logs. The keys the frontend consumes:

    {"pro_email": "...", "pro_password": "...", "course_title": "...", "seat_code": "XXXX-XXXX-XXXX-XXXX"}

The frontend maps those to `E2E_PRO_EMAIL`, `E2E_PRO_PASSWORD`,
`E2E_COURSE_TITLE`, and `E2E_SEAT_CODE`. Print `course_title` rather than letting
the frontend hardcode it, so the title stays a backend concern and the two sides
cannot drift. The email, password, and course title may be fixed constants (the
password is a non-secret test fixture by design, and should be documented as
such); the seat code is fresh every run.

Isolation is the one operational subtlety. CI should run the seeder once against
an empty data directory, so the simplest safe contract is: refuse to seed if the
professor email already exists (the `users.email` unique constraint makes this a
clean check), unless an explicit `--reset` flag is passed that first drops
`directory.db` and the `courses/` shards. That guard also keeps the script from
ever quietly mutating a real data directory.

## The CI job

Add an `e2e` job to `.github/workflows/ci.yml`. It spans both apps, so please
coordinate the edit with the frontend session rather than landing a concurrent
change to the shared workflow; we have collided on `ci.yml` before. The shape:

- Check out, set up uv, Node 22, and pnpm; `uv sync --locked` in `apps/api` and
  `pnpm install --frozen-lockfile` in `apps/web`; `pnpm exec playwright install
  --with-deps chromium` for the browser.
- Export `TIRO_DATA_DIR` to a fresh temp dir and `TIRO_JWT_SECRET` to any fixed
  value, then start the API in the background with
  `uvicorn app.main:create_app --factory --port 8000` and wait for
  `GET /api/v1/health` to return ok.
- Run the seeder, capture its JSON line, and export the four `E2E_*` values plus
  `API_BASE_URL=http://127.0.0.1:8000`. Use `127.0.0.1`, not `localhost`: on some
  runners Node resolves `localhost` to IPv6 `::1` while uvicorn binds IPv4 only,
  and the server-side fetch then fails with a connection refused. This bit us
  locally.
- Run `pnpm exec playwright test` from `apps/web`. The Playwright config starts
  `next dev` itself and the dev server inherits `API_BASE_URL` from the job env,
  so no extra wiring is needed. Tear the API process down at the end.

The seeder imports only `app.auth.passwords`, `app.db` (connection, migrations,
shard manager), and `app.seats.codes`, none of which need the Rust extension, so
the `e2e` job can skip the `maturin develop` step that the `api` job needs. If a
future import pulls in `app.compression`, add the wheel build back.

## The backend gate for this work

The seeder is code and reviewed like code: it must pass `ruff check .` and
`mypy .` with the rest of `apps/api`. Add one pytest alongside it (for example
`apps/api/scripts/test_seed_e2e.py`) that runs the seeder against a `tmp_path`
data directory and asserts the invariants the frontend depends on: a professor
row whose stored hash verifies against the printed password, a course owned by
that professor, exactly one active seat, and a seat code that `verify_code`
accepts against the stored hash. That test keeps the output contract from
drifting and means the helper is exercised even when the browser job is not.

When this lands, update the `tirocinium-testing` skill: the Phase 2 gate's
journey-one item, currently noted as the frontend's to close, becomes a live CI
job, and the seeder joins the list of maintenance scripts. The frontend README's
seed-and-run recipe (`apps/web/README.md`) already documents the four env values
and the manual recipe; point it at the committed script once it exists.

## Numbering

If you record this as a decision, take the next free number and let the frontend
session know, since we have already renumbered once after a concurrent collision.
This handoff itself is intentionally unnumbered.
