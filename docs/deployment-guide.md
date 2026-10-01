# Deploying Tirocinium

Follow this top to bottom. Every step says what to run and what you should see;
if you see something else, stop at that step rather than carrying on, because
most later steps assume the earlier ones actually worked.

This deploys one course, BREE 216, to `tirocinium.sasellab.com`, on one EC2
instance, with one professor account. The reasoning behind that shape is in
`docs/decisions/0091-one-host-one-account.md`; the files you will install are
in `infra/deploy/`.

Budget about ninety minutes the first time, most of it waiting on builds.

---

## Before you start

Have these in hand. Stopping halfway to find an API key is how a deploy ends
up half configured.

- An AWS account, and the ability to create S3 buckets, an IAM user, and an
  EC2 instance.
- Control of DNS for `sasellab.com`.
- An Anthropic API key. The tutor, the handwriting reader and variant
  generation all need it.
- An OpenAI API key, for retrieval embeddings.
- The email address that will hold the only account: `ebenezer.kwofie@mcgill.ca`.
- The machine that currently holds BREE 216's data, if you are moving the
  existing variant pool rather than regenerating it.

Optional, and fine to add later: Deepgram and Cartesia keys for spoken
defences. Without them a defence runs as a typed session with caption replies,
which is the same loop and the designed floor, not a broken state.

---

## 1. AWS resources

### 1.1 Buckets

Four buckets, all private, in one region. This guide uses `ca-central-1`;
substitute consistently if you choose another.

```bash
for b in tirocinium-scans tirocinium-imports tirocinium-artifacts tirocinium-backups; do
  aws s3api create-bucket --bucket "$b" --region ca-central-1 \
    --create-bucket-configuration LocationConstraint=ca-central-1
  aws s3api put-public-access-block --bucket "$b" \
    --public-access-block-configuration \
    "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"
done
```

**Check:** `aws s3 ls | grep tirocinium` lists four buckets.

The first three hold student scans, imported PDFs and figures, and one-time
download artifacts. The fourth holds the replicated databases, and is the one
you would be glad of on the worst day.

### 1.2 An IAM user for Litestream

The application can use an instance role, but Litestream needs explicit keys
today. Give it its own user with access to the backup bucket only, so a leaked
key cannot reach student scans.

```bash
aws iam create-user --user-name tirocinium-litestream
aws iam put-user-policy --user-name tirocinium-litestream \
  --policy-name backups --policy-document '{
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Allow",
      "Action": ["s3:*"],
      "Resource": ["arn:aws:s3:::tirocinium-backups",
                   "arn:aws:s3:::tirocinium-backups/*"]
    }]
  }'
aws iam create-access-key --user-name tirocinium-litestream
```

**Keep the output.** The secret is shown once. It goes into the env file in
step 4.

### 1.3 The instance

- **Type:** `t3.small` is enough for one course. Choose `t3.medium` if you
  expect the worker to generate variants while students are working.
  `t4g.small` also works: pdfium has an arm64 build and the Rust extension
  compiles from source, so ARM is supported, it just builds more slowly.
- **Image:** Ubuntu 24.04 LTS.
- **Storage:** the default root volume, plus a **20 GB gp3** volume. The second
  volume is the only thing on the box whose loss matters.
- **Security group:** inbound 80 and 443 from anywhere, 22 from your address
  only. Nothing else. The API, Next and Redis all listen on loopback and are
  reached only through Caddy.
- **Elastic IP:** allocate one and associate it. Without it the address changes
  on every stop and your DNS goes stale.
- **Instance role:** optional but preferred, with read and write on the three
  non-backup buckets. If you use one, leave the application's S3 keys empty in
  step 4 and boto3 will find the role.

Mount the data volume:

```bash
sudo mkfs.ext4 /dev/nvme1n1          # confirm the device with lsblk first
sudo mkdir -p /var/lib/tirocinium
echo "/dev/nvme1n1 /var/lib/tirocinium ext4 defaults,nofail 0 2" | sudo tee -a /etc/fstab
sudo mount -a
```

**Check:** `df -h /var/lib/tirocinium` shows the new volume, not the root one.
Getting this wrong means the shards live on the root volume and are lost with
the instance.

---

## 2. DNS

Point `tirocinium.sasellab.com` at the Elastic IP with an A record.

**Do this before step 6.** Caddy requests a certificate on first start, and if
the name does not resolve yet the challenge fails and Caddy backs off for a
while before retrying.

**Check, from your laptop:**

```bash
dig +short tirocinium.sasellab.com      # the Elastic IP, and nothing else
```

---

## 3. Provision the host

SSH in, then:

```bash
sudo apt-get update && sudo apt-get install -y git git-lfs
git clone https://github.com/Amankrah/tirocinium.git /tmp/tirocinium
sudo /tmp/tirocinium/infra/deploy/provision.sh
```

This installs Python 3.12, Node 20, Redis, Caddy, a Rust toolchain and the
pinned pdfium binary; creates the `tirocinium` service user and the directories
it owns; and installs the unit files and the Caddyfile. It is idempotent, so
re-run it if a step fails.

**Check:** it ends with a numbered list of what is left to do. If it stops
earlier, read the last line: the usual causes are no network or a region
without the NodeSource mirror.

---

## 4. Configure

```bash
sudo nano /etc/tirocinium/tirocinium.env
```

Fill in, at minimum:

| Key | Value |
|---|---|
| `TIRO_JWT_SECRET` | `openssl rand -hex 32` |
| `TIRO_ANTHROPIC_API_KEY` | your key |
| `TIRO_OPENAI_API_KEY` | your key |
| `TIRO_S3_ACCESS_KEY`, `TIRO_S3_SECRET_KEY` | the Litestream user's keys from 1.2, unless you gave the instance a role for the application too |
| `TIRO_SIGNUP_ALLOWLIST` | `ebenezer.kwofie@mcgill.ca` |

Leave the rest at the template's values. The file is `0640`, owned by root with
the service group, and must stay that way:

```bash
sudo chmod 640 /etc/tirocinium/tirocinium.env
sudo chown root:tirocinium /etc/tirocinium/tirocinium.env
```

**Do not commit a filled copy anywhere.** Every value below the first block of
the template is a credential.

---

## 5. Deploy the application

```bash
sudo -u tirocinium git clone https://github.com/Amankrah/tirocinium.git /opt/tirocinium/app
cd /opt/tirocinium/app
sudo -u tirocinium git lfs pull
```

`git lfs pull` is not optional. The course pack's figures are LFS objects, and
an unfetched pointer reaching pdfium raises `PdfiumLibraryInternalError`, which
reads like a decode bug and is not.

**Backend:**

```bash
cd /opt/tirocinium/app/apps/api
sudo -u tirocinium python3.12 -m venv .venv
sudo -u tirocinium .venv/bin/pip install -q uv maturin
sudo -u tirocinium .venv/bin/uv sync --frozen
sudo -u tirocinium env HOME=/opt/tirocinium PATH=/opt/tirocinium/.cargo/bin:$PATH \
  VIRTUAL_ENV="$PWD/.venv" .venv/bin/maturin develop --release \
  --manifest-path ../../crates/platform_core/python/Cargo.toml
```

The last command compiles the Rust extension. It takes several minutes on a
small instance and that is normal.

**Check:**

```bash
sudo -u tirocinium .venv/bin/python -c "import platform_core, app.worker; print('ok')"
```

**Frontend:**

```bash
cd /opt/tirocinium/app/apps/web
sudo -u tirocinium env HOME=/opt/tirocinium pnpm install --frozen-lockfile
sudo -u tirocinium env HOME=/opt/tirocinium pnpm build
```

**Check:** the build prints a route table and no route exceeds 170 kB of first
load JS.

---

## 6. Start the services

```bash
sudo systemctl enable --now litestream tirocinium-api tirocinium-worker tirocinium-web caddy
sudo systemctl status tirocinium-api tirocinium-worker tirocinium-web --no-pager
```

**Check, in this order:**

```bash
curl -s http://127.0.0.1:8000/api/v1/health      # {"status":"ok"}
curl -s https://tirocinium.sasellab.com/api/v1/health   # the same, over TLS
```

If the second fails but the first works, it is Caddy or DNS, not the
application. `sudo journalctl -u caddy -n 50` will say which.

---

## 7. Create the one account

Open `https://tirocinium.sasellab.com/sign-up` and sign up as
`ebenezer.kwofie@mcgill.ca`.

Generate the password rather than inventing one, and put it in a password
manager:

```bash
openssl rand -base64 24
```

Twelve characters is the floor the API enforces. This account is the only way
into every course on the box, so give it considerably more than the floor.

**Check that the door is actually shut:**

```bash
curl -s -o /dev/null -w '%{http_code}\n' \
  -X POST https://tirocinium.sasellab.com/api/v1/auth/signup \
  -H 'content-type: application/json' \
  -d '{"email":"nobody@example.com","password":"a-long-enough-password"}'
```

**Expected: `403`.** If you get `201`, the allowlist is not set and you have
just created an account; delete that user row before going further.

---

## 8. Load BREE 216

### 8.1 If you are regenerating from the pack

Everything the course needs is in the repository: the questions, the worked
solutions, the figures, the concepts, the shortlists and the parameter specs.

```bash
cd /opt/tirocinium/app/apps/api
sudo -u tirocinium .venv/bin/python scripts/load_course_pack.py bree-216 \
  --professor ebenezer.kwofie@mcgill.ca
```

**Check:** it prints one JSON line reporting 70 questions created.

This gives you the course and the questions but **no variant pool**. The
variants would have to be generated again, which costs real money and takes
hours. Prefer 8.2 if the pool already exists somewhere.

### 8.2 If you are moving the existing variant pool

On the machine that holds the course today:

```bash
cd apps/api
TIRO_DATA_DIR=<that machine's data dir> .venv/bin/python scripts/export_course.py \
  --course-id 1 --out /tmp/bree216-export \
  --keep-flagged-from variant-generation/v4
```

**Check:** it prints counts. You should see 70 case studies and several hundred
variants.

The export copies with `VACUUM INTO` rather than `cp`, because a live SQLite
database has a WAL beside it and a plain file copy can land a torn database
that opens happily and is missing the last writes. `--keep-flagged-from` drops
variants flagged by a prompt version that no longer exists, so the professor's
review queue holds real problems rather than a history of prompt revisions.

Move the figure bytes, then the shard:

```bash
aws s3 sync <old imports bucket> s3://tirocinium-imports
scp /tmp/bree216-export/1.db ubuntu@tirocinium.sasellab.com:/tmp/
```

On the host:

```bash
sudo systemctl stop tirocinium-api tirocinium-worker
sudo install -o tirocinium -g tirocinium -m 0640 /tmp/1.db \
  /var/lib/tirocinium/data/courses/1.db
sudo systemctl start tirocinium-api tirocinium-worker

cd /opt/tirocinium/app/apps/api
sudo -u tirocinium .venv/bin/python scripts/load_course_pack.py bree-216 \
  --professor ebenezer.kwofie@mcgill.ca
```

Stopping the services first matters: the shard has one writer, and replacing
the file under a running process is how you get a corrupt database.

That last load is idempotent and keyed on the pack's own item keys, so it
adopts the case studies already in the restored shard rather than duplicating
them. It also pins the course to the professor and to the materials catalogue.

**Check:** it reports `questions_created: 0` and `questions_updated: 70`. If it
says 70 created, the shard did not restore and you now have a duplicate course.

**Do not move the directory database.** It holds development accounts, and this
deployment has exactly one real one.

---

## 9. Verify the whole thing works

```bash
# the course is there and published
curl -s https://tirocinium.sasellab.com/api/v1/health

# backups are real
cd /opt/tirocinium/app/apps/api
sudo -u tirocinium .venv/bin/python scripts/verify_backups.py
```

`verify_backups.py` fails a shard whose newest snapshot is missing, older than
36 hours, or zero bytes, and exits non-zero if it discovers no shards at all,
because verifying nothing is not verification. Immediately after a first
deploy it may report the snapshot as too new rather than too old; re-run it
after Litestream has been up a few minutes.

Then do it as a person:

1. Sign in at `https://tirocinium.sasellab.com/sign-in`.
2. Open the course. You should see 70 questions grouped by topic.
3. Open a question. The problem typesets, and any figure renders.
4. Press **New variant**. The question should change. If it says "This is the
   only version of this problem so far", that question's pool is empty, which
   is expected for the ten questions that are not parameterized.
5. Generate a seat code from the course's seats page, open a private window,
   and redeem it at `/enter`. Confirm the student sees the same question.

---

## 10. Prove the backups before you need them

A backup nobody has restored is a hypothesis.

```bash
cd /opt/tirocinium/app
sudo -u tirocinium ./infra/restore-drill.sh
```

Run this once now, against this deployment's real bucket. The scheduled
verification in `.github/workflows/backup-drill.yml` keeps it honest afterwards.

---

## Upgrading later

```bash
cd /opt/tirocinium/app
sudo -u tirocinium git pull && sudo -u tirocinium git lfs pull
# rebuild as in step 5, then:
sudo systemctl restart tirocinium-api tirocinium-worker tirocinium-web
```

Migrations apply per shard at startup, so restarting the API *is* the
migration. Restart the worker too; it holds its own shard handles.

---

## When something is wrong

**Caddy will not get a certificate.** DNS is not resolving yet, or port 80 is
closed in the security group. Caddy needs 80 for the challenge even though the
site runs on 443. `sudo journalctl -u caddy -n 50`.

**The API starts and immediately exits.** Usually a missing value in the env
file. `sudo journalctl -u tirocinium-api -n 50`.

**`PdfiumLibraryInternalError(FormatError)`.** An unfetched LFS pointer reached
pdfium. Run `git lfs pull` in `/opt/tirocinium/app` and restart the worker.

**A student's defence never connects.** `API_BASE_URL` in
`tirocinium-web.service` must be the public origin, not `127.0.0.1`. The same
value is handed to the browser to open the defence WebSocket, so pointing it at
the loopback tells every student to open a socket against their own machine.

**Seat codes stop being redeemable.** Redemption is rate limited to ten per
hour per IP address. A whole class behind one NAT will hit that. Raise
`TIRO_SEAT_REDEEM_MAX_ATTEMPTS` in the env file; it can only be raised, never
lowered below ten.

**Variant generation produces nothing.** Check the worker is running and that
`TIRO_ANTHROPIC_API_KEY` is set in the env file the *worker* reads. A pool fill
runs for a long time by design, one variant at a time;
`sudo journalctl -u tirocinium-worker -f` shows it working.

**Do not run `PRAGMA wal_checkpoint(TRUNCATE)` on a shard.** It breaks
Litestream's shadow WAL and the replica silently stops being restorable. If you
need a copy by hand, use `scripts/export_course.py`, which goes through
`VACUUM INTO`.

---

## What this deployment deliberately does not do

- **It does not scale by adding API processes.** The unit pins `--workers 1`.
  A second process would race the per-shard writer and would double the
  in-memory seat-redemption ceiling. Growth means putting courses on separate
  instances with sticky routing.
- **It does not accept new professors.** One address is allowlisted. Opening it
  up is an edit to `TIRO_SIGNUP_ALLOWLIST` and a restart.
- **It does not keep audio.** A defence leaves a text transcript and a verdict.
  No column, bucket or log holds student voice.
