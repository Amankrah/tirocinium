# Deploying Tirocinium to tirocinium.sasellab.com

One EC2 instance runs everything: the API, the worker, the web app, Redis and
Caddy. That is not a compromise, it is what the data layer asks for. Shards are
SQLite files on a disk with one writer each, replicated by Litestream; the
worker holds jobs open for hours; pdfium is a native library bound once per
process; the defence is a long-lived WebSocket. None of that survives a
serverless host, and splitting the web app onto one would put a cross-cloud hop
in front of every authed read for little gain, because this frontend
deliberately bypasses the image optimiser it would be renting.

## Shape

    browser ──https──> Caddy ──/api/*──> uvicorn  127.0.0.1:8000  (one process)
                            └──else────> next     127.0.0.1:3000
                                          arq worker  (no port)
                                          redis       127.0.0.1:6379
                                          litestream ──> s3://tirocinium-backups
    scans, figures, artifacts ──────────> s3://tirocinium-{scans,imports,artifacts}

One API process, deliberately. Two would race the per-shard writer and would
multiply the ten-per-hour seat redemption ceiling by the worker count, because
that limiter counts in memory. Scale by putting courses on separate instances,
never by adding workers here.

## Instance

`t3.small` is enough for one course; `t3.medium` if the worker generates
variants while students are working. Check the architecture before reaching for
`t4g`: pdfium is a pinned prebuilt binary and the Rust extension is compiled, so
confirm `infra/provision-pdfium.sh` resolves an aarch64 build before choosing
ARM. On x86 you are on the path CI already exercises.

Give it a gp3 volume mounted at `/var/lib/tirocinium`. That is the only thing
on the box whose loss matters, and the only thing Litestream replicates.

An instance profile with read and write on the four buckets is better than
putting keys in the env file. If you use one, leave `TIRO_S3_ACCESS_KEY` and
`TIRO_S3_SECRET_KEY` empty; boto3 finds the role. Litestream needs them
explicitly today, so either set them for its sake or give Litestream its own
IAM user.

## DNS

An A record for `tirocinium.sasellab.com` at the instance's Elastic IP. Caddy
obtains and renews the certificate on first start, so bring DNS up before
starting Caddy or the first start will fail the challenge and back off.

## Install

    sudo ./infra/deploy/provision.sh

Then fill `/etc/tirocinium/tirocinium.env`. Every value under "credentials" is
one; the file is `0640` and owned by root with the service group. Generate the
JWT secret rather than inventing one:

    openssl rand -hex 32

## Deploy the application

    sudo -u tirocinium git clone https://github.com/Amankrah/tirocinium.git /opt/tirocinium/app
    cd /opt/tirocinium/app && sudo -u tirocinium git lfs pull

    # backend: the venv and the compiled extension
    cd apps/api
    sudo -u tirocinium python3.12 -m venv .venv
    sudo -u tirocinium .venv/bin/pip install -q uv maturin
    sudo -u tirocinium .venv/bin/uv sync --frozen
    sudo -u tirocinium env VIRTUAL_ENV="$PWD/.venv" .venv/bin/maturin develop --release \
      --manifest-path ../../crates/platform_core/python/Cargo.toml

    # frontend: build once, serve the build
    cd ../web
    sudo -u tirocinium corepack enable && sudo -u tirocinium pnpm install --frozen-lockfile
    sudo -u tirocinium pnpm build

`git lfs pull` is not optional. The pack's figures are LFS objects, and an
unfetched pointer reaching pdfium raises `PdfiumLibraryInternalError`, which
reads like a decode bug and is not.

## Move BREE 216 across

The pack in the repository carries the questions, solutions, figures,
concepts, shortlists and parameter specs, so a fresh deployment can rebuild the
course from source. What it cannot rebuild is the variant pool: 507 verified
variants that cost real money and were each independently re-solved. So the
shard travels.

On the machine that holds the course today:

    cd apps/api
    TIRO_DATA_DIR=<that machine's data dir> .venv/bin/python scripts/export_course.py \
      --course-id 1 --out /tmp/bree216-export \
      --keep-flagged-from variant-generation/v4

The export uses `VACUUM INTO`, never `cp`: a live SQLite database has a WAL
beside it and copying the file alone can land a torn database that opens
happily and is missing the last writes. `--keep-flagged-from` drops variants
flagged by a prompt version that no longer exists, because the flagged queue is
for triaging real problems rather than for reading a history of prompt
revisions.

Move the figure bytes with the object store, then the shard:

    aws s3 sync <old imports bucket> s3://tirocinium-imports
    scp /tmp/bree216-export/1.db ubuntu@<host>:/tmp/
    sudo install -o tirocinium -g tirocinium -m 0640 /tmp/1.db /var/lib/tirocinium/data/courses/1.db

The directory database is **not** moved. It holds the development accounts, and
this deployment gets exactly one real account. Start the services, sign up once
as the allowlisted address, then attach the course:

    cd /opt/tirocinium/app/apps/api
    sudo -u tirocinium .venv/bin/python scripts/load_course_pack.py bree-216 \
      --professor ebenezer.kwofie@mcgill.ca

That load is idempotent and keyed on the pack's own item keys, so it adopts the
case studies already in the restored shard rather than duplicating them, and it
pins the course to the professor and to the materials catalogue.

## The one account

`TIRO_SIGNUP_ALLOWLIST` names the only address that may create an account.
Everything else gets a 403 and an honest line on the page. The door is closed
by configuration rather than by removing the route, so the same build serves an
open deployment and this one.

Closing the door is not revoking a key: an account that already exists keeps
signing in whatever the list later says. To actually remove access, delete the
user row.

Choose the password with a generator and store it in a password manager. Twelve
characters is the floor the API enforces; this account is the only way into
every course on the box, so give it far more than the floor:

    openssl rand -base64 24

## Start

    sudo systemctl enable --now litestream tirocinium-api tirocinium-worker tirocinium-web caddy
    sudo systemctl status tirocinium-api tirocinium-worker tirocinium-web

## Check it is actually working

    curl -s https://tirocinium.sasellab.com/api/v1/health          # {"status":"ok"}
    curl -s -o /dev/null -w '%{http_code}\n' \
      -X POST https://tirocinium.sasellab.com/api/v1/auth/signup \
      -H 'content-type: application/json' \
      -d '{"email":"nobody@example.com","password":"a-long-enough-password"}'   # 403

    sudo -u tirocinium .venv/bin/python scripts/verify_backups.py   # every shard fresh

The last one matters more than it looks: discovering no shards exits non-zero,
because verifying nothing is not verification.

## Backups

Litestream replicates continuously. The restore drill is `infra/restore-drill.sh`
and the scheduled verification is `scripts/verify_backups.py`, which fails a
shard whose newest snapshot is missing, older than 36 hours, or zero bytes.
Run the drill once against this deployment's bucket before trusting it; a
backup nobody has restored is a hypothesis.

## Upgrades

    cd /opt/tirocinium/app && sudo -u tirocinium git pull && sudo -u tirocinium git lfs pull
    # rebuild as in "Deploy the application", then:
    sudo systemctl restart tirocinium-api tirocinium-worker tirocinium-web

Migrations apply per shard at startup, so the API restart is the migration.
Restart the worker too: it holds its own shard handles.
