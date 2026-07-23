-- Retrieval embedding provenance and requantization source (backend guide 3.3
-- "Embeddings quantization" and section 4 Stage 4, milestone 3.4). The core
-- schema (0003) stores the int8 codes and their per-vector scale, which is all
-- retrieval reads. The guide also asks to keep the float32 originals for the
-- current model version, compressed as a zstd blob, so a model change can
-- requantize without re-embedding; these two columns hold that source and the
-- model id it came from. Both are nullable: an int8 row without its float32
-- source is still fully usable for retrieval, and existing rows predate this.
ALTER TABLE embeddings ADD COLUMN vec_f32_z BLOB;
ALTER TABLE embeddings ADD COLUMN model_id TEXT;
