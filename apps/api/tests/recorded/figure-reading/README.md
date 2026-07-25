# Recorded figure-reading responses

Recorded vision-model readings for the figure-frozen check (backend guide 6.1,
milestone 5.1), one JSON file per figure, named for the sha256 of the exact
figure bytes the model was shown. The `RecordedFigureReader`
(app/params/model.py) replays these so the test suite runs the frozen check
without calling a live model (model calls in tests are recorded, always).

Each file is a JSON object matching `FigureReading`: a `values` array of the
literal strings the figure displays (numbers with their units, labels, table
cells), exactly as printed. The model only lists displayed values; it never
describes or interprets the figure, and in production a figure is read once
ever, cached by content hash in the shard's `figure_readings` table. The
param-spec tests build their reader in memory, so the gate needs no committed
asset; this is where a captured set lands as the PDF corpus grows.

Versioned prompts live at `apps/api/prompts/figure-reading/`.
