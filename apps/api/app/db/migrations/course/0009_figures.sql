-- Figures extracted from imported PDFs (backend guide section 5 Stage 1b,
-- milestone 4.2). Figures are pixels from the professor's original: the bytes
-- live in object storage next to the source PDF, and this table holds only
-- metadata (consistent with section 3.3). Rows are content-addressed and
-- deduplicate across imports by content_hash; they are re-parented from an
-- import item to a case study at confirmation (4.4), so this table is not
-- staging and outlives a job. The item_figures link table lands with
-- segmentation (4.3), once import_items exist.
--
-- source records how the figure was obtained: an embedded_raster kept from the
-- PDF stream byte for byte, a vector_render of a clustered drawing at 300 dpi,
-- or a page_crop the vision detector proposes on a scanned page. bbox is the
-- figure's position on its source page as JSON [x, y, w, h] normalised to 0..1
-- of the page (top-left origin, decision 0032): the one frame consistent across
-- born-digital points and page_crop pixels, which a client maps onto a displayed
-- page or sends back to a crop verb with no page-dimension plumbing.
CREATE TABLE figures (
  id INTEGER PRIMARY KEY,
  content_hash TEXT NOT NULL UNIQUE,
  storage_key TEXT NOT NULL,           -- lossless original crop in object storage
  storage_key_2x TEXT,                 -- high-density rendition (vector renders)
  source TEXT NOT NULL,                -- 'embedded_raster' | 'vector_render' | 'page_crop'
  page INTEGER,                        -- source page index
  bbox TEXT,                           -- JSON [x, y, w, h], page points, top-left origin
  width_px INTEGER NOT NULL,
  height_px INTEGER NOT NULL,
  caption TEXT,                        -- nearby-text guess; the professor confirms it
  created_at INTEGER NOT NULL
);
