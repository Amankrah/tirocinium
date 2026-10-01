# 0087: the model is constrained, not asked

Pointing the Phase 5 generation loop at a real course for the first time found
that it could not read a single reply. Every verification call died in
`parse_resolved` with `JSONDecodeError: Expecting value: line 1 column 1`,
which is what `json.loads` says when it is handed prose.

`variant-verification/v1` ends "Return a single JSON object, and nothing else"
and gives the shape. Claude Opus 5 answers with a worked solution in markdown.
Captured from a live call: the reply is a thinking block carrying no text,
then a text block beginning "## Setting up". The instruction was clear and the
model did something else, which is the ordinary situation a prompt cannot fix
by being firmer.

So both seams now constrain the reply instead of requesting it:
`output_config={"format": {"type": "json_schema", "schema": ...}}` on the
generation and verification calls, with the schema naming exactly the fields
the pydantic model needs. The parse cannot fail because the API will not
return anything else. The schemas deliberately omit `input_tokens` and
`output_tokens`: those come from the provider's usage block, and asking a
model to report its own billing would be asking it to invent a number.

Three prompt revisions came out of the same run and belong with this one,
because together they are the difference between a pool that fills and a pool
that does not. Each was measured rather than guessed.

v2 stopped the two passes stating one result twice. The comparer reads the
numbers out of each answer and matches them element by element, so
"R = 1.431 x 10^-8 cm = 0.1431 nm" from one pass and "0.1431 nm" from the
other is a structural mismatch between two correct answers. Flag rate before:
every variant. After: about a third.

v3 moved the choice of unit, of ordering, and of fraction-against-percentage
into the question text. The verification pass never sees the generated
solution, by design, so it cannot match a format it was not told about; the
only thing both passes read is the question. A variant question now names the
unit each result should be given in and letters its parts. Flag rate after:
a few percent.

v4 kept prose out of `final_answers` altogether. A part that asks for a reason
or a comparison gets no entry, because two independent solvers never write the
same paragraph, and `final_answers` feeds `answer_match`, which looks for
numbers in a student's handwriting and could never have used a sentence
anyway. This was what stood between five questions and any verified variant at
all.

The general lesson is the first line of this record. Where a reply has to
parse, constrain it. Where two independent passes have to agree, put what they
must agree about somewhere they can both see it.
