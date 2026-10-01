# 0090: jobs get timeouts that fit the work

`WorkerSettings` never set `job_timeout`, so every job ran under arq's default
of 300 seconds. For two of the four jobs that is the wrong order of magnitude,
and for one of them it meant the feature could not work at all.

A pool fill generates variants one at a time. That sequencing is deliberate:
it is the generation concurrency cap made structural (milestone 5.4), one
generation call in flight per case study however many fills are requested.
Each variant is a generation call and an independent re-solve, so roughly a
minute, and the fill may attempt up to three times its target before giving
up. At the shipped default target of twenty variants that is an hour of honest
work against a five-minute ceiling. The variant pool has never been able to
reach its own default target.

It fails quietly, which is the worse part. arq cancels the job mid-fill, the
pool is left short, and the shortfall reads as "generation keeps flagging"
rather than "the job was killed". Loading BREE 216 showed fifteen fills ending
at exactly `300.00s !` and a verified-per-question histogram that stopped dead
below the target, which is what finally gave it away.

Timeouts are now set per function rather than globally, because the four jobs
have genuinely different shapes: a pool fill is bounded by its target times
its attempt ceiling, a submission by twenty-five pages through preprocessing
and a vision model, an import by two hundred pages plus segmentation, a single
variant by one generate-and-verify pair. A single global value generous enough
for a fill would let a hung submission hold a worker slot for an hour, and one
tight enough for a submission truncates every fill.

These are ceilings on runaway work and not expected durations. If a job
routinely approaches one, the thing to fix is the job.
