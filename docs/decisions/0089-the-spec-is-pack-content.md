# 0089: the parameter spec is pack content

A course pack (decision 0077) carries a course's taught content: its concepts,
its questions, the professor's worked solutions, the figures, and the
marketplace shortlists. It did not carry the parameter specs, and that gap was
invisible until BREE 216 had sixty of them.

A spec is reviewed content by exactly the same argument the solution is. It is
what the professor disposed of after the AI proposed: the parameters, their
ranges, and the invariants that keep a generated variant well-posed. Leaving
it out meant the specs existed only in one shard on one laptop. A pack loaded
anywhere else produced a course that looked complete, published every
question, and silently never pre-generated a single variant, because publish
enqueues a pool fill only when `param_spec_z` is set.

So `param_spec` is now a field on a pack question, written to the same column
the 5.1 editor writes. Two things keep it honest. It is validated at parse
time against the real `ParamSpec` model, the one the param-spec PUT uses, so a
spec the editor would refuse cannot reach a shard through the pack instead.
And the specs baked into BREE 216's revision were read back out of the shard
after the PUT accepted them, not copied from the file I had been editing: the
PUT is the authority because it runs the figure-frozen check, and a spec that
survived it is one the platform agreed to.

The loader still never overwrites a spec it did not bring. A pack without
`param_spec` on a question leaves whatever is there alone, so a professor who
edits a spec in the UI does not lose it to the next pack load.
