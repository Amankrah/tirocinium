# 0035 — A local .env for keys and runtime overrides, loaded off the test path

Date: 2026-07-24. Cross-cutting (developer configuration). Author: backend
engineer (Claude).

**The API and worker load an optional, gitignored `apps/api/.env` (via
python-dotenv) at package import, so the model provider keys and runtime
overrides live in one local file rather than being exported by hand each session;
the load is skipped whenever `TIRO_TESTING` is set, so the recorded-response test
suite never picks up a developer's real keys or a real broker URL.** Until now the
keys were read straight from the process environment (`TIRO_ANTHROPIC_API_KEY` for
transcription, PDF segmentation, and figure detection; `TIRO_OPENAI_API_KEY` for
retrieval embeddings), which meant setting them in every shell that launched the
API or the arq worker. A local `.env` is the conventional fix; `python-dotenv` was
already a locked transitive dependency of `uvicorn[standard]`, so it is promoted to
a direct dependency and `load_dotenv(find_dotenv(usecwd=True))` runs once from
`app/__init__.py` (through `app/env.py`). Loading at package import, not inside
`create_app`, means the API factory, the worker startup, and the maintenance
scripts all see the file before any client or module-level default is constructed,
and covers overrides read at import time (model ids, `TIRO_DATA_DIR`,
`TIRO_REDIS_URL`, the S3 seam) as well as the keys. python-dotenv's default
`override=False` keeps a real environment variable authoritative over the file, so
a value set in the shell or by the deployment still wins and production is
unaffected (it simply has no `.env`).

The one risk a package-import side effect creates is the test suite inheriting a
developer's `.env`: that would let real keys into a process that is supposed to use
recorded mocks, and could inject a `TIRO_REDIS_URL` that makes tests reach for a
broker. So `load_local_env()` is a no-op when `TIRO_TESTING` is set, and
`conftest.py` sets `TIRO_TESTING=1` before anything imports the app (pytest loads
conftest first), a guard proven both directions (with the flag the file is ignored,
without it the file loads). `.env` and `.env.*` are already gitignored with
`!.env.example` un-ignored; a committed `apps/api/.env.example` documents every
name with empty values and states that the keys are needed only for live runs
(the worker, and the retrieval query embed on the API), never for the suite. This
keeps the "no student PII / keys are credentials" posture intact: the real secret
file is never committed and never enters a test run.
