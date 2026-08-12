# 0058: the attempt span, and why the server holds the stopwatch

Milestone 9.6 reserves time for what the builders judged useful and parked. The
first item taken from that list is not a new idea but an unmet one: frontend
guide 4.2 says that when a student starts a problem "they get a clean 'start
attempt' moment that timestamps the beginning, and the submission carries that
span (started, submitted) as an honest record of engaged time", and nothing in
the platform recorded a start. Decision 0049 flagged the gap when the personal
history was built and could not show engaged time; this closes it.

The design question is who holds the stopwatch. The cheap route is a
`started_at` field on the submission body, filled in by the client from when it
rendered the problem. That was rejected. The span is shown to the professor as
evidence of engaged work, and a span the client names is a span the client can
invent; a record that can be fabricated is not the "honest record" the guide
asks for, and it would be worse than no record because it would look like one.
So the start is a server-recorded row: `POST /variants/{id}/attempts` (seat
only) inserts into `attempts` with the server's clock and returns its id, and
the submission may cite that attempt. The citation is checked rather than
trusted, inside the same transaction that creates the submission: an attempt
belonging to another seat, or to another variant, or one that does not exist,
contributes nothing. An attempt on a different variant is refused specifically
so a student cannot open a trivial problem, leave it running, and cite it from a
hard one.

Three smaller choices follow from the same principle. A submission with no
attempt carries a null span rather than a fabricated one, because "nobody
recorded the start" is a true thing to say and zero is not. A stale attempt id
from a reloaded page is ignored rather than rejected, so a client bug costs the
student their span and never their submission. And starting twice is ordinary
rather than an error: a student may open a problem, put it down, and come back,
so each start is its own row and only the one the submission cites becomes a
span. The span is denormalised onto the submission at creation so it is frozen
there and every reader shows it without a join; `engaged_seconds` is derived at
the read, in the student's own history and in the professor's review queue,
which are the two places the guide wants effort to be legible.
