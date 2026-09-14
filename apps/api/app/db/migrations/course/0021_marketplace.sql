-- The materials marketplace (Phase 10, decision 0062): the quotations a student
-- builds against a variant, and the professor's per-case-study shortlist.
--
-- Catalogue lines are not here. They are a versioned file asset pinned per
-- course in the directory, so these tables reference a line by its SKU string
-- and never by a foreign key; a quotation must outlive a catalogue revision.

-- The professor's shortlist for one case study: the lines a student is pointed
-- at first, the marketplace's equivalent of the source artifact's project
-- briefs. It narrows, never restricts. A student may quote anything in the
-- catalogue, because deciding that a material is wrong is the exercise, and a
-- catalogue that hid the wrong answers would be doing the exercise for them.
CREATE TABLE case_study_shortlist (
  case_study_id INTEGER NOT NULL REFERENCES case_studies(id) ON DELETE CASCADE,
  sku TEXT NOT NULL,
  position INTEGER NOT NULL,
  PRIMARY KEY (case_study_id, sku)
);

-- A quotation. Draft while the student builds it, issued once and never again:
-- issuing stamps the number, the clock and the validity, and freezes every line
-- into quote_lines below. A seat may hold several drafts and several issued
-- quotations for one variant, because comparing two routes by quoting both is
-- the exercise working as intended.
CREATE TABLE quotes (
  id INTEGER PRIMARY KEY,
  variant_id INTEGER NOT NULL REFERENCES variants(id),
  seat_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  quote_number TEXT,
  catalogue_id TEXT NOT NULL,
  catalogue_version INTEGER NOT NULL,
  -- Totals in integer cents, computed server-side at issue and stored, so the
  -- artifact reads back identically without recomputing against a catalogue
  -- that may have moved.
  goods_cents INTEGER,
  discount_cents INTEGER,
  cut_fee_cents INTEGER,
  freight_cents INTEGER,
  tax_cents INTEGER,
  total_cents INTEGER,
  total_mass_grams INTEGER,
  created_at INTEGER NOT NULL,
  issued_at INTEGER,
  valid_until INTEGER
);
CREATE INDEX idx_quotes_seat_variant ON quotes(seat_id, variant_id);
CREATE UNIQUE INDEX idx_quotes_number ON quotes(quote_number) WHERE quote_number IS NOT NULL;

-- One line, snapshotted. The description, unit and unit price are copied rather
-- than referenced for the same reason a paper quotation prints them: the price
-- is only true of this variant at this moment, and the catalogue is free to
-- move afterwards.
CREATE TABLE quote_lines (
  id INTEGER PRIMARY KEY,
  quote_id INTEGER NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  sku TEXT NOT NULL,
  supplier_id TEXT NOT NULL,
  name TEXT NOT NULL,
  spec TEXT NOT NULL,
  unit TEXT NOT NULL,
  quantity REAL NOT NULL,
  cut_to_length INTEGER NOT NULL DEFAULT 0,
  cut_count INTEGER NOT NULL DEFAULT 1,
  list_price_cents INTEGER NOT NULL,
  unit_price_cents INTEGER NOT NULL,
  break_percent INTEGER NOT NULL DEFAULT 0,
  extended_cents INTEGER NOT NULL,
  line_cut_fee_cents INTEGER NOT NULL DEFAULT 0,
  mass_grams INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_quote_lines_quote ON quote_lines(quote_id, position);

-- A request for quotation and the notes that answered it. The answer is
-- deterministic rules over the student's own answers (decision 0062), so it is
-- stored rather than recomputed only because the student may cite it, and a
-- cited artifact that changes under a rules revision is not a citation.
CREATE TABLE rfqs (
  id INTEGER PRIMARY KEY,
  variant_id INTEGER NOT NULL REFERENCES variants(id),
  seat_id INTEGER NOT NULL,
  reference TEXT NOT NULL,
  sku TEXT,
  request_json_z BLOB NOT NULL,
  notes_json_z BLOB NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_rfqs_seat_variant ON rfqs(seat_id, variant_id);

-- A submission may cite an issued quotation, on exactly the terms the attempt
-- span set in migration 0020: checked inside the creating transaction rather
-- than trusted, and null when there is none rather than an empty basket.
ALTER TABLE submissions ADD COLUMN quote_id INTEGER REFERENCES quotes(id);
