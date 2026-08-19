# 0065: the segfault, relocated, amplified, and narrowed to app construction

This supersedes the crash-site description in decisions 0054 and 0056 and one
of the two refutations in 0057. It does not end in a fix either, but it moves
the investigation off a false premise it has been standing on since Phase 9.2,
and it leaves behind a reproducer four times stronger than the one everyone has
been working with.

**The crash is not where three decisions said it was.** 0054 recorded it as
"mid garbage collection on an anyio worker thread inside Starlette request
handling", and 0056 and 0057 reasoned from that. It is not. Every crash in a
forty-run baseline was identical, and faulthandler is unambiguous: the process
dies at pytest session teardown, in `_pytest/unraisableexception.py`'s
`gc_collect_harder`, reached from `_ensure_unconfigure`, with **one thread
alive**, the main one. No worker thread, no request in flight, no test running:
the last test has already passed and the suite is shutting down. The gdb
backtrace in 0056 was real, but the `task_step`/`context_run` frames under it
were read as the crash context when they are not the whole story, and the
"anyio worker thread" description appears to have come from that reading rather
than from a thread dump.

**0057's garbage-collector refutation cannot stand.** It reported that
"disabling the garbage collector does not fix it" and retired the GC hypothesis
on that basis. But `gc.disable()` suppresses only *automatic* collection, and
the collection that crashes is an explicit `gc.collect()` that pytest's
`unraisableexception` plugin calls at teardown, five times, from a count it
exposes as a stash key. Disabling the collector could not have prevented it, so
the hypothesis was never actually tested. It is open again.

**The rate, measured the way 0057 said to measure it.** Forty runs on exit
status: three SIGSEGV, thirty-five clean, and two runs that failed a *test*
rather than crashing, which is a separate flakiness not yet identified. So
7.5%, consistent with the "about one in ten" that has been quoted, and now on a
sound instrument.

**One hypothesis raised and killed cheaply.** Every shard read and write runs on
a worker thread through `asyncio.to_thread`, and `app/db/connection.py` opens
every connection `check_same_thread=False`, which made connections finalised by
the collector an attractive suspect. A census of live objects taken immediately
before pytest's forced collection found **zero** `sqlite3.Connection` objects,
open or closed. They are not involved.

**There is an amplifier, and it is the useful part of this decision.** Raising
pytest's `gc_collect_iterations` from its default of 5 to 50 (the plugin is
three lines; the count is a stash key precisely so it can be overridden) takes
the crash rate from 6% to **6 in 20, 30%**. That is a fourfold amplification and
it changes what is affordable: separating 7.5% from zero takes sixty runs, and
separating 30% from zero takes ten. Any future experiment on this bug should run
under the amplifier.

**And the amplifier moved the crash somewhere much more specific.** At the
default count the crash is always at teardown. Amplified, four of the six land
mid-suite, and their stacks all say the same thing: the collector is walking a
graph built by FastAPI route and dependency construction.

    Garbage-collecting
    fastapi/dependencies/utils.py in get_flat_dependant   (x4 recursive)
    fastapi/routing.py in _build_dependant_with_parameterless_dependencies
    fastapi/routing.py in _populate_api_route_state

    Garbage-collecting
    pydantic/_internal/_generate_schema.py in __init__
    pydantic/type_adapter.py in _init_core_attrs
    fastapi/_compat/v2.py in __post_init__

    Garbage-collecting
    fastapi/openapi/utils.py in get_openapi

Route construction, dependency flattening, OpenAPI generation, and pydantic
`TypeAdapter` schema building. That is the neighbourhood, and `pydantic_core`
is the one third-party native extension living in it.

**The trigger is not the suite's scale.** 0056 concluded that two standalone
harnesses failing to reproduce meant "the trigger needs the real suite's scale".
That is now doubtful: a subset of four test packages, 88 tests running in 11
seconds, reproduces it under the amplifier (1 in 30). What the harnesses were
missing was more plausibly the churn of building this application's full route
table over and over, not sheer volume. The suite constructs the app 29 times
across its fixtures, and each construction builds every route's dependant tree
and every model's schema.

**What was attempted and yields nothing.** Forcing a full collection after every
test never crashed in 20 runs, which is only weak evidence (21% chance of that
under the baseline rate) and is consistent with the corruption being introduced
and consumed within a single test's app construction. Forty runs under gdb were
clean, but that comparison is worthless as run: it used different pytest flags
from the baseline arm and gdb disables ASLR by default, so it varies two things
at once and is recorded here only so nobody repeats it thinking it was a
control.

**The next step.** Build a standalone reproducer that constructs this
application's FastAPI app in a loop with aggressive forced collection and no
pytest at all. If it crashes, it is a minimal upstream reproducer against
pydantic-core or FastAPI and should be filed as one; if it does not, the missing
ingredient is pytest's own machinery, and the `unraisablehook` is the thing to
look at next, since it calls `repr()` on an object whose finaliser has just
raised, which is a real way to touch a half-destroyed extension object. Pinning
a different `pydantic_core` and re-measuring under the amplifier is the other
cheap experiment now available and was not affordable before.

The operational rule is unchanged and stays in both skills: never read one green
run as a passing gate, and treat a signal-11 exit as its own outcome rather than
as a test failure. The lab that produced all of this (the arm runner, the
amplifier, the census, and the analysis) is reproducible from the commands in
the testing skill.
