# 0051: load against the p95 budgets, and what the harness measures

Milestone 9.1 asks for load testing against every p95 budget in backend guide
section 2 with a simulated 80-seat course under a deadline-night traffic shape.
The harness (`app/test_load.py`) drives the real ASGI application concurrently:
sixteen redeemed seats, each looping through the practice reads (case study
list, case study, pooled variant, mastery picture, personal history) and then
bursting into the write path (request upload targets, complete the manifest,
read the submission back), against the realistic fixture shard of fifty
published case studies, a hundred verified variants, and five hundred processed
submissions. Reads and writes are timed separately because the budgets are
separate, and the measured p95 is printed on every run so a regression shows in
the log long before it crosses the line. Two things about what this measures.
It runs in process, so the numbers are handler time and exclude network, TLS,
and the reverse proxy, which is the same spirit as the guide excluding AI calls;
what it does include is everything the request path actually carries, the
authorization dependency layer, the shard read pool, blob decompression, and
the telemetry middleware added in 8.5. And no AI call appears because no worker
runs: `complete` enqueues onto the null queue, which is the honest shape of the
request path, since the guide puts stages 2 to 4 off it deliberately. The gate
asserts every response is 2xx and that the expected number of calls were made,
because a 404 is fast and a load run full of them would report a flattering p95
while measuring nothing. Current margins are wide: reads p95 around 28 ms
against 150, writes around 36 ms against 400, and reads under a concurrent
all-seats write burst around 59 ms, so the single-writer queue serializes
without starving readers, which is the design's most load-sensitive claim and
therefore has its own test. Nothing needed fixing, so 9.1's "fix what fails" is
vacuous this time and the harness stands as the thing that will catch it later.
One finding worth recording: building the world tripped the redemption rate
limiter, because ten attempts per IP per hour is the specified control and a
class redeeming from one address is exactly what it exists to stop. The harness
now redeems each seat from its own address, modelling students on their own
devices rather than disabling the control, and the limiter's own note that a
multi-process deployment may need it behind Redis is carried into 9.2.
