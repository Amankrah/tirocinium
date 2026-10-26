# 0109: a repeated variant is not a new one

Decision 0088 made "New variant" say so when the pool had nothing else to give,
but it recognised only one form of that answer, the dry pool's null variant id.
The practice read has a second: when the only servable variant is the one on
screen, it serves that variant again rather than nothing, because repeating it
beats waiting. Every course-pack question lands with exactly one `manual`
variant (decision 0077), so on a loaded pack this is the ordinary case, and the
surface treated a non-null id as a fresh problem, swapped in identical text and
said nothing: the button appeared not to work. The client now counts an answer
carrying the id already on screen exactly as 0088 counts a null one, keeping the
problem, its controls and any running attempt, and showing the line. The backend
is unchanged, since serving the same variant is still the right answer to a
caller that wants a body. The line itself loses its second sentence ("Your
professor's others are still being prepared"), which was true of a dry pool
with a parameter spec and false of a pack question with none, where nothing
will ever be generated; "This is the only version of this problem so far" is
true in every case that reaches it.
