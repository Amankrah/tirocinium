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

- An AWS account, and the ability to create S3 buckets and an IAM user, to
  allocate an Elastic IP, and to attach a volume to the running instance.
  The `aws` CLI configured locally, or the console and some patience.
- Control of DNS for `sasellab.com`.
- An Anthropic API key (the tutor, the handwriting reader and variant
  generation all need it) and an OpenAI API key for retrieval embeddings. If
  you already run the project locally these are in `apps/api/.env` and step 4
  copies them across for you.
- The email address that will hold the only account: `ebenezer.kwofie@mcgill.ca`.
- The machine that currently holds BREE 216's data, if you are moving the
  existing variant pool rather than regenerating it.

The EC2 instance is already running (`i-0323067f24bbf4f3d`, `ca-central-1`), so
step 1 verifies and repairs a host rather than creating one. The buckets in 1.1
and 1.2 can be done whenever, but 1.3 is first on the host itself: the keypair
the instance was launched with was briefly public, and nothing else there is
worth doing until it is replaced.

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

Worth knowing why these are not just directories on the instance. Binary never
goes in SQLite (backend guide 3.3), so a shard holds storage keys and metadata
while the bytes live in a bucket; a course's figures alone would otherwise
bloat every replication and every hand-copy. The browser uploads straight to
the bucket through a presigned URL, so a class's worth of phone photos never
passes through the API, which on this instance is a single uvicorn worker. And
Litestream's whole job is getting the shards off the box, so a backup bucket on
the same volume as the thing it backs up would not be a backup.

The storage layer is a seam, so the first three buckets could be a MinIO on the
instance, which is what development uses. The fourth could not, and once you are
running S3 for backups the other three cost cents and save you operating MinIO.

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

### 1.3 Rotate the key, before anything else

`tiro_key` reached a public commit, and this instance is running with that key's
public half in `~/.ssh/authorized_keys`. It is an open door until you replace
it, and no other step in this guide is worth doing while that is true. Decision
0092 has the reasoning.

Make a new key on your laptop:

```bash
ssh-keygen -t ed25519 -f ~/.ssh/tiro_key_new -C tirocinium
chmod 600 ~/.ssh/tiro_key_new
```

Install it using the old key, which still works:

```bash
ssh -i ~/.ssh/tiro_key.pem ubuntu@15.223.224.192 \
  "cat >> ~/.ssh/authorized_keys" < ~/.ssh/tiro_key_new.pub
```

**Leave that terminal open.** In a second one, prove the new key works:

```bash
ssh -i ~/.ssh/tiro_key_new ubuntu@15.223.224.192 'echo in'
```

Only once that prints `in`, drop the leaked key's line:

```bash
ssh -i ~/.ssh/tiro_key_new ubuntu@15.223.224.192 \
  "grep -v 'tiro_key' ~/.ssh/authorized_keys > /tmp/ak && mv /tmp/ak ~/.ssh/authorized_keys"
```

Editing the only file that grants you access, over the connection it grants, is
the one step here that can lock you out of your own instance. The open session
is the way back in if it goes wrong.

**Check:** the old key is refused and the new one still works.

```bash
ssh -o BatchMode=yes -i ~/.ssh/tiro_key.pem ubuntu@<address> 'echo in'   # Permission denied
ssh -o BatchMode=yes -i ~/.ssh/tiro_key_new ubuntu@<address> 'echo in'   # in
```

Then `rm ~/.ssh/tiro_key.pem`, and delete the `tiro_key` keypair in the EC2
console so nothing can be launched with it again.

Finally, read who has been in. The key was public for a window while this
instance was already running:

```bash
ssh -i ~/.ssh/tiro_key_new ubuntu@<address> \
  'last -F; sudo grep -i "Accepted" /var/log/auth.log'
```

**Expected:** your own logins, from your own address, and nothing else. If you
find anything you cannot account for, terminate this instance and launch a
replacement rather than cleaning it, because you cannot prove what was changed
on a host someone else may have held. It carries nothing of value yet, which is
what makes that cheap today and expensive after the course is loaded.

Every `ssh` and `scp` from here on uses `-i ~/.ssh/tiro_key_new`.

### 1.4 The instance

It already exists, launched 1 October 2026. Its facts, which later steps refer
back to:

| | |
|---|---|
| Name | `tirocinium` |
| Instance | `i-0323067f24bbf4f3d`, `t3.medium`, Ubuntu 24.04 |
| Region and zone | `ca-central-1`, `ca-central-1b` |
| Public IPv4 | `15.223.224.192`, auto-assigned (see below) |
| Keypair | `tiro_key` |
| Security group | `launch-wizard-11` |
| IMDSv2 | required, which is the setting you want |

A `t3.medium` is comfortable for one course, with room for the worker to
generate variants while students are working.

Four things were not settled at launch. Run these from your laptop with the AWS
CLI, or do the equivalent in the console.

**An Elastic IP.** The instance has an auto-assigned address, which it loses the
first time it stops and starts. Two things downstream need the address to hold
still: the DNS record, and the certificate Caddy gets for the name.

```bash
ALLOC=$(aws ec2 allocate-address --domain vpc --query AllocationId --output text)
aws ec2 associate-address --instance-id i-0323067f24bbf4f3d --allocation-id "$ALLOC"
aws ec2 describe-instances --instance-ids i-0323067f24bbf4f3d \
  --query 'Reservations[].Instances[].PublicIpAddress' --output text
```

That last command prints the address the instance now answers on, and it will
**not** be `15.223.224.192`: associating an Elastic IP replaces the auto-assigned
address rather than promoting it. Use the printed address everywhere below, and
expect your current SSH session to drop when it changes.

**The security group.** `launch-wizard-11` is whatever the wizard made. It needs
exactly three inbound rules: 80 and 443 from anywhere, and 22 from your address
alone. The API, Next and Redis all listen on loopback and are reached only
through Caddy, so nothing else has any reason to be open.

```bash
SG=$(aws ec2 describe-instances --instance-ids i-0323067f24bbf4f3d \
  --query 'Reservations[].Instances[].SecurityGroups[].GroupId' --output text)
aws ec2 describe-security-group-rules --filters Name=group-id,Values=$SG \
  --query 'SecurityGroupRules[?!IsEgress].{port:FromPort,cidr:CidrIpv4}' --output table
```

**Check:** nothing inbound beyond 80, 443 and 22. If 22 stands open to
`0.0.0.0/0`, narrow it now, because the key that opens it was briefly public.

**An instance role, or explicit keys.** The instance has no IAM role attached.
Either attach one with read and write on the three non-backup buckets, which is
tidier and avoids long-lived secrets on the box, or leave it as is and put
explicit S3 credentials in the env file at step 4. Choose one deliberately: with
neither, every upload fails the same unhelpful way.

**The data volume.** Shards live under `/var/lib/tirocinium`, and that must be a
separate volume rather than the root disk, because the root disk dies with the
instance. See what is actually attached:

```bash
ssh -i ~/.ssh/tiro_key_new ubuntu@<address> lsblk
```

If only the root device is there, create and attach one:

```bash
VOL=$(aws ec2 create-volume --size 20 --volume-type gp3 \
  --availability-zone ca-central-1b --query VolumeId --output text)
aws ec2 attach-volume --instance-id i-0323067f24bbf4f3d \
  --volume-id "$VOL" --device /dev/sdf
```

Then, on the host:

```bash
lsblk                                  # confirm the device name before formatting
sudo mkfs.ext4 /dev/nvme1n1
sudo mkdir -p /var/lib/tirocinium
echo "/dev/nvme1n1 /var/lib/tirocinium ext4 defaults,nofail 0 2" | sudo tee -a /etc/fstab
sudo mount -a
```

**Check:** `df -h /var/lib/tirocinium` names the new volume, not the root one.
Getting this wrong puts every shard on a disk that is lost with the instance.

---

## 2. DNS

Point `tirocinium.sasellab.com` at the Elastic IP from step 1.3 with an A
record. Use the Elastic IP, not `15.223.224.192`, which the instance stops
answering on the moment the Elastic IP is associated.

**Do this before step 6.** Caddy requests a certificate on first start, and if
the name does not resolve yet the challenge fails and Caddy backs off for a
while before retrying.

**Check, from your laptop:**

```bash
dig +short tirocinium.sasellab.com      # the Elastic IP, and nothing else
```

---

## 3. Provision the host

SSH in with `ssh -i ~/.ssh/tiro_key_new ubuntu@tirocinium.sasellab.com`, then:

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

The keys you already run locally are the ones the server needs, so build the
server file from `apps/api/.env` rather than retyping them. **From your laptop,
in the repository:**

```bash
./infra/deploy/build-server-env.sh ~/tirocinium.env
```

It prints the key names it carried across and never prints a value. What it
carries is deliberately narrow: the provider keys and the model pins, which are
account-level facts that are the same from a laptop as from EC2.

Three things it does not carry.

`TIRO_JWT_SECRET` is **regenerated**. A secret that has lived on a development
machine signs tokens that would then be valid in production, and the whole
value of the secret is that only the server holds it. Carrying it across would
quietly make every development token a production credential.

The storage settings are rewritten, because local runs talk to MinIO on
loopback and the deployment talks to S3.

`TIRO_DATA_DIR` is rewritten to `/var/lib/tirocinium/data`, because local runs
keep shards under the repository and the deployment keeps them on the volume
that outlives the instance.

The script refuses to write inside the repository at all, which is the same
lesson as decision 0092 expressed as code rather than as a rule to remember.

Open the result and settle the one decision it leaves you:

```bash
nano ~/tirocinium.env
```

`TIRO_S3_ACCESS_KEY` and `TIRO_S3_SECRET_KEY` are empty, and so is
`TIRO_S3_ENDPOINT`. Empty is meaningful here rather than unfinished: it means
the ambient AWS settings, so the credentials come from the instance role and
the endpoint is the regional S3 one. Leave all three empty if you attached a
role in step 1.4.

Fill the two credentials only if you did not attach a role. Do not paste the
Litestream user's keys into them: that user reaches the backup bucket and
nothing else, while the application needs the other three.

Ship it, then destroy the copy that travelled:

```bash
scp -i ~/.ssh/tiro_key_new ~/tirocinium.env ubuntu@tirocinium.sasellab.com:/tmp/
ssh -i ~/.ssh/tiro_key_new ubuntu@tirocinium.sasellab.com \
  "sudo install -o root -g tirocinium -m 0640 /tmp/tirocinium.env \
     /etc/tirocinium/tirocinium.env && rm -f /tmp/tirocinium.env"
shred -u ~/tirocinium.env
```

`install` sets the owner, group and mode in one step, so the file is never
briefly world-readable on the host the way `cp` then `chmod` would leave it.
The `rm` and the `shred` matter for the same reason: `/tmp` on the server and
your home directory are both places a credentials file should not quietly
accumulate.

**Check:**

```bash
ssh -i ~/.ssh/tiro_key_new ubuntu@tirocinium.sasellab.com \
  'sudo stat -c "%U:%G %a %n" /etc/tirocinium/tirocinium.env; \
   sudo grep -c . /etc/tirocinium/tirocinium.env'
```

**Expected:** `root:tirocinium 640 /etc/tirocinium/tirocinium.env`, and a line
count in the twenties. If the mode is `644`, the service user is not the only
reader and every key in the file should be considered shared.

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
scp -i ~/.ssh/tiro_key_new /tmp/bree216-export/1.db \
  ubuntu@tirocinium.sasellab.com:/tmp/
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
