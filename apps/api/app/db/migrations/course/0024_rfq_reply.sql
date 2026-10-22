-- The supplier desk's reply to a request for quotation (decision 0108). The
-- authored notes stay in notes_json_z, because they are the fallback and the
-- reviewable half; the desk's reply, when a model wrote one, is stored beside
-- them with its provenance, exactly as every other generated artifact carries
-- the model id and the prompt version that produced it. A row written before
-- this migration reads back as a rules-only answer.
ALTER TABLE rfqs ADD COLUMN reply_json_z BLOB;
ALTER TABLE rfqs ADD COLUMN reply_source TEXT NOT NULL DEFAULT 'rules';
ALTER TABLE rfqs ADD COLUMN reply_model_id TEXT;
ALTER TABLE rfqs ADD COLUMN reply_prompt_version TEXT;
