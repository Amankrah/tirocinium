# 0057: the segfault, two hypotheses refuted and a measurement corrected

This supersedes the conclusions of decision 0056. The backtrace it reported
stands; the explanation it leaned toward does not, and the numbers it and
decision 0054 quoted were produced by a detection method that undercounts. Both
corrections matter more than the tidier story they replace.

**The PGO and LTO hypothesis is refuted.** 0056 argued that the crash was most
likely an optimisation-sensitive problem in the python-build-standalone
interpreter, on the strength of the `.llvm` and `.warm` symbol suffixes and a
pydantic issue with the same signature that vanished on an `-O0` CPython. That
was testable and is now tested. CPython 3.12.13 was built from source on this
host with `--disable-optimizations --without-lto` (plain GCC 11.4, no profile
data, no link-time optimisation, against a locally built SQLite with FTS5), the
full environment was installed against it, and the suite still segfaults, twice
within the first fourteen runs. Whatever this is, it is not the optimised build.

**Disabling the garbage collector does not fix it either.** Since every
backtrace lands in `gc_collect_main`, switching off automatic generational
collection for the run was the obvious mitigation and looked at first like it
worked. It does not: with correct detection the suite still took SIGSEGV. That
also removes the one workaround that would have made the gate reliable without
understanding the cause.

**The measurement was wrong, and every rate quoted so far is a lower bound.**
Crashes were being counted by grepping the captured output for
`Fatal Python error`, which is what faulthandler prints. A process can take
SIGSEGV without that line reaching the log, and at least one run did exactly
that: the shell reported a segmentation fault while the grep found nothing.
Crash counting must key on the exit status (139 for SIGSEGV), not on the log
text. Consequently the rates in 0054 and 0056, and the pyo3 0.23 against 0.29
comparison that the pyo3 upgrade was rejected on, are all suspect: they are
directionally plausible but were gathered with an instrument that silently
misses events. Before that upgrade decision is treated as settled it should be
re-measured on exit status.

What still holds from 0056: the faulting frame is CPython's own
`gc_collect_main`, reached from ordinary Python code, with no third-party native
frame on the stack; `PYTHONMALLOC=debug` reports no corrupted block; the crash
appears on 3.12.11, 3.12.13, 3.13.12 and now a self-built unoptimised 3.12.13;
and two standalone harnesses, one with no project code and one exercising every
native module including ours, do not reproduce it, so the trigger needs the real
suite's scale.

The next step is bisection by extension rather than another whole-system
hypothesis: run the suite with the optional native accelerators removed one at a
time (`hiredis`, `websockets.speedups`, and the Pillow paths the fixtures use)
and measure each on exit status over enough runs to distinguish a rate of ten
per cent from zero, which is roughly thirty. Until something is found, the
operational rule is unchanged and is in both skills: never read one green run as
a passing gate, and treat a signal-11 exit as its own outcome rather than as a
test failure.
