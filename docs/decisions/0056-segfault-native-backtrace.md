# 0056: the intermittent segfault, chased to a native backtrace

Decision 0054 recorded that the Python suite segfaults on roughly one full run
in ten and named a native backtrace as the next step. This is that
investigation. It does not end in a fix, so what follows is the evidence and
the boundary of what it supports, which is more useful than a guess.

The backtrace, taken by running the suite under gdb until it faulted, puts the
crash inside CPython's collector itself:

    #0  gc_collect_main.llvm ()
    #1  _PyEval_EvalFrameDefault.warm ()
    #2  gen_iternext ()
    #3  mutablemapping_add_pairs ()
    ...  odict_init () / type_call () / task_step () / context_run ()

Two things stand out. The faulting frame is `gc_collect_main`, reached from
ordinary Python code (an `OrderedDict` being initialised inside an asyncio task
step), and there is no third-party native frame anywhere on the crashing stack:
not our extension, not pydantic-core, not pdfium. The collector is walking an
object graph that is already inconsistent, so the damage was done earlier by
something that leaves no trace at the point of death. The `.llvm` and `.warm`
symbol suffixes are the other clue: this interpreter is a python-build-standalone
Clang build with thin LTO and PGO.

What the evidence rules out, or fails to support. `PYTHONMALLOC=debug` produces
the same crash with no corrupted-block diagnostic, which argues against a
classic buffer overrun or use-after-free of a Python heap block. The crash is
independent of the pytest version (8 and 9) and of the pyo3 version (0.23 and
0.29), and of the CPython version and build: measured rates are 5 crashes in 50
runs on 3.12.13, 3 in 15 on 3.12.11, and 1 in 14 on 3.13.12, all
python-build-standalone. Moving to a newer interpreter is therefore not a
remedy. `gc.freeze()` after collection, which removes the large immortal import
graph from every collection, did not help either.

Two standalone harnesses were built to isolate our code. The first reproduces
the suite's shape (many FastAPI applications built, pydantic schemas generated,
driven through `TestClient` across threads with forced collections) and loads
none of our code: no crashes in 12 runs. The second adds every native module the
suite loads, our own extension included, and exercises the codec, the comparer,
and the quantizer under the same churn: no crashes in 14 runs. Neither
reproduces, so the trigger needs something the real suite has and these do not,
most plausibly its scale and the variety of object graphs it builds. That means
our extension is not exonerated by these harnesses, only that it is not
sufficient on its own.

The closest public analogue is pydantic issue 7181, a CPython 3.12 crash with
the same signature (`gc_collect_main`, weakref handling) which the reporter
found disappeared when CPython was rebuilt with `-O0`, and which was never
attributed. That is consistent with everything above and is why the leading
hypothesis is an optimisation-sensitive problem in the interpreter rather than
a defect in this project, but it is a hypothesis and it is labelled as one.

The decisive experiment not yet run is a CPython 3.12 built without PGO and LTO,
or any non-python-build-standalone 3.12; this host has no distro 3.12 and
building one from source was out of proportion to the remaining session. If the
crash vanishes there, the matter is settled and the action is to pin a different
interpreter for CI. Until then the operational rule stands and is in both
skills: never read a single green run as a passing gate, and treat a signal-11
exit as distinct from a test failure rather than as one.
