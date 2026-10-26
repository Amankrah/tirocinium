-- A cut-to-size line's pieces (decision 0114), frozen with the rest of the
-- line at issue so an issued quotation reads back the pieces it was struck
-- for. JSON, one array of [length_mm, width_mm, count] per piece; empty on a
-- line bought by the unit. The derived quantity, cuts and fee are already in
-- the columns beside it.
ALTER TABLE quote_lines ADD COLUMN pieces_json TEXT NOT NULL DEFAULT '[]';
