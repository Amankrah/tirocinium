# Deployment artifacts

The guide to follow is [`docs/deployment-guide.md`](../../docs/deployment-guide.md).
It is the sequence; this directory is what the sequence installs. The reasoning
behind the shape (one host, one account, and why not serverless) is
[decision 0091](../../docs/decisions/0091-one-host-one-account.md).

| File | What it is | Installed to |
|---|---|---|
| `provision.sh` | One-time host bootstrap: packages, Node 20, Caddy, Rust, pdfium, the service user, the directories, the units. Idempotent. | run in place |
| `build-server-env.sh` | Builds the server env file from a local `apps/api/.env`: carries the provider keys and model pins, regenerates the JWT secret, rewrites the storage and data-directory settings, and refuses to write inside the repository. | run from your laptop |
| `tirocinium.env.example` | Every setting the services read, with the credentials grouped at the end. | `/etc/tirocinium/tirocinium.env` (0640, root:tirocinium) |
| `tirocinium-api.service` | uvicorn, one worker, loopback only. | `/etc/systemd/system/` |
| `tirocinium-worker.service` | The arq worker. No port. | `/etc/systemd/system/` |
| `tirocinium-web.service` | `next start`, loopback only. | `/etc/systemd/system/` |
| `Caddyfile` | TLS, and the path split between the API and Next on one origin. | `/etc/caddy/Caddyfile` |
| `litestream.yml` | Continuous replication of the directory and every course shard to S3. | `/etc/litestream.yml` |

Three things in here are load bearing and easy to undo by accident.

`tirocinium-api.service` pins `--workers 1`. The shard layer keeps one writer
per course and the seat-redemption limiter counts in memory, so a second worker
races the writer and doubles the ten-per-hour ceiling.

`tirocinium-web.service` sets `API_BASE_URL` to the **public origin**, not the
loopback. The same value is handed to the browser to open the defence
WebSocket, so the loopback would tell every student to open a socket against
their own machine.

`litestream.yml` takes a glob over `courses/*.db`, so a course added later is
replicated without editing anything. A new course appearing unbacked is exactly
what `scripts/verify_backups.py` exists to catch, and it should not be able to
happen in the first place.
