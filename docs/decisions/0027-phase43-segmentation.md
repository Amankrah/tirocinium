# 0027 — Phase 4.3: segmentation into staged items

Date: 2026-07-24. Phase 4, milestone 4.3. Author: backend engineer (Claude).

**A decoded import job's page markdowns are segmented by a fidelity-strict model
pass into items (question/solution pairs with figure assignments) that land in a
staging table as `pending`; a 30-day purge removes the ones the professor never
confirms. The AI proposes and the professor disposes: nothing here becomes
student-visible course content.** Segmentation is a text pass, a `Segmenter`
seam (`app/imports/segmentation.py`) mirroring the vision and embedder seams:
`AnthropicSegmenter` (Claude) in production, `RecordedSegmenter` replaying a
document's items by the sha256 of the assembled text in tests, so the gate runs
with no live model. The versioned prompt (`prompts/segmentation/v1`) is strict
about fidelity (reproduce the professor's wording, do not summarize, keep every
figure token in place and assign it by id, pair a question with its solution and
flag a missing or misplaced one), and treats the document as data to segment,
never as instructions to obey. The document the model sees is the page markdowns
concatenated with `<!-- page N -->` markers and the `fig://` tokens placed in
4.2: figure bytes never enter this prompt, only the tokens, and a staging test
asserts it. The pipeline runs segmentation as its final step, after every page is
decoded and its figures extracted.

Items stage in `import_items` (migration course/0010) with `state='pending'`;
`item_figures` links each item to the figures its `figure_ids` name, but only to
figure ids that actually exist, so a hallucinated id is dropped rather than left
dangling; every linked figure starts `essential` (the professor marks a figure
decorative in 4.4). Two departures from the guide's representative schema are
recorded here: `import_items` gains `title` and `notes`, which the model returns
and the confirmation surface needs but the guide's block omits; and it gains
`model_id` and `prompt_version`, because provenance travels with every generated
artifact (the standing model-call rule), the same as `page_transcriptions`
carries. The 30-day purge (`app/imports/purge.py`) removes unconfirmed jobs older
than the TTL with their items, item links, and pages, and then any figure no item
references that is itself older than the TTL (so a recent job's not-yet-assigned
figures are safe); confirmed jobs and recent jobs are left alone. It removes shard
rows only; sweeping the deduplicated figure objects from storage is a separate
garbage pass, not done here.

Two scope boundaries. First, confirmation is not part of 4.3: copying a
confirmed item into `case_studies` as a draft with re-parented figures is the
guide's Stage 3 and the phases document's 4.4, so the confirm endpoint is the
next backend slice, and items simply wait in staging until then. Second, the
vision figure detector, the second of the two detectors whose union is proposed
to the professor, is still to build. The phases document lists it under 4.2 but
the guide runs the model detector during this Stage 2 pass; decision 0025 moved
it here, and 4.3 has shipped the segmentation half of Stage 2 but not yet the
vision detector. When it lands it is a separate vision seam over scanned page
images proposing figure boxes that become `page_crop` figures unioned with the
deterministic set, which is how scanned pages get figures at all; augmenting
born-digital pages and the spatial de-duplication across the two detectors are
refinements that want the five-PDF corpus to calibrate. Recorded so the union is
tracked, not silently dropped.
