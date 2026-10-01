# 0091: one host, one account

Tirocinium's first deployment is a single course taught by one professor at
`tirocinium.sasellab.com`. Two decisions follow from that, and both are
narrower than the product will eventually want.

## One host

The data layer decides this, not taste. Shards are SQLite files on a disk,
each with one writer behind a serialized queue, replicated continuously by
Litestream. The worker holds jobs open for hours (decision 0090). pdfium is a
vendored native library that binds once per process and holds a process-wide
lock. The defence is a long-lived WebSocket and submission progress is SSE.
A serverless host offers none of that: no persistent filesystem, no sidecar to
ship a WAL, an execution ceiling in minutes, and concurrent isolated functions
which is precisely the thing one-writer-per-shard forbids.

So: one EC2 instance running the API, the worker, Next, Redis and Caddy, with
a gp3 volume for the shards and S3 for everything else. Splitting the frontend
onto a serverless host was considered and rejected for now: this frontend
deliberately bypasses the image optimiser it would be renting (decision 0066),
and every authed read goes server-side, so the split buys previews and costs a
cross-cloud hop on each one.

One API process, with `--workers 1` written into the unit and the reason
beside it. A second would race the per-shard writer, and the seat-redemption
limiter counts in memory, so two workers make the ten-per-hour ceiling twenty.
Scaling is per-course sharding with sticky routing, not replicas. That is worth
knowing before it is urgent.

One trap found while writing the unit files, recorded because it is invisible
until a student tries to defend: `API_BASE_URL` is read both by the
server-side fetches and by `lib/api/defence.ts`, which derives the defence
WebSocket URL from it and hands that to the browser. Point it at the loopback
and every student is told to open a socket against their own machine. It must
be the public origin, and server-to-server calls take the local hop back
through Caddy.

## One account

Self-serve signup (decision 0072) is right for the product and wrong here: on
a public hostname it is an open door to a deployment that should have exactly
one professor. `TIRO_SIGNUP_ALLOWLIST` names the addresses that may create an
account; unset or empty means open, which is what every existing deployment
and the whole test suite already assume, because a control that changes
behaviour when nobody configured it is a trap.

Three properties are deliberate. The check runs before the password is hashed,
so a closed deployment cannot be made to burn Argon2id cycles by anyone who
can reach the endpoint. The refusal is the same for every address not on the
list, so it reports nothing about whether an account exists. And closing the
door is not revoking a key: an account that exists keeps signing in whatever
the list later says, because an operator editing a list should not silently
lock out a working account. Removing access means deleting the user.

The account is still made through the product's own signup rather than by a
script, which keeps decision 0077's rule intact: there is one way to make an
account, and this narrows who may use it rather than adding a second way.

## What travels

The pack carries the questions, solutions, figures, concepts, shortlists and
parameter specs, so the course rebuilds from the repository. The variant pool
does not: those 507 variants are model output that cost real money and were
each independently re-solved. So the course shard moves, copied with
`VACUUM INTO` and never with `cp`, because a live SQLite database has a WAL
beside it and a file copy can land a torn database that opens happily and is
missing the last writes.

The directory database does not travel. It holds development accounts, and
this deployment gets one real one.
