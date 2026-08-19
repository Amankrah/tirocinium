"""A pytest plugin that makes the intermittent segfault four times likelier.

Run it when you are investigating the crash of decisions 0054 to 0065, never in
CI:

    .venv/bin/python -m pytest -q -p scripts.gc_amplifier

The crash is the collector dying on an object graph that is already
inconsistent, and pytest walks that graph on purpose: its `unraisableexception`
plugin calls `gc.collect()` five times at teardown, and after every test, from a
count it deliberately exposes as a stash key so it can be overridden. Raising
that count to fifty took the measured rate from 3 in 40 runs to 6 in 20, which
is the difference between needing sixty runs to tell a real effect from zero and
needing ten.

It also changes *where* the crash lands, which is how decision 0065 narrowed the
search: at the default count every crash is at session teardown, and amplified
most of them land mid-suite inside FastAPI route and dependency construction and
pydantic schema building, which is the neighbourhood to look in.

Two rules for using it. Count crashes by exit status (139 is SIGSEGV), never by
grepping the log for `Fatal Python error`: a process can take the signal without
faulthandler printing, which is how every rate before decision 0057 came to be a
lower bound. And keep the pytest flags identical between the arms you compare;
a previous attempt varied the flags and the debugger at the same time and had to
be thrown away.
"""

from _pytest.config import Config
from _pytest.unraisableexception import gc_collect_iterations_key

# Fifty is not special. It is large enough to amplify plainly and small enough
# that a run still finishes in about the same wall clock.
ITERATIONS = 50


def pytest_configure(config: Config) -> None:
    config.stash[gc_collect_iterations_key] = ITERATIONS
