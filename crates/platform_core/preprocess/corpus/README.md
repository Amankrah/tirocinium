# Handwriting scan corpus

This is the golden-file corpus for scan preprocessing (backend guide section 4,
milestone 3.2). It is a project asset that grows deliberately and lives in Git
LFS, like every corpus (see the repo `.gitattributes` and the phases doc's
standing practices).

## What belongs here

Thirty real phone photos of handwritten worked problems, of deliberately
varying quality, under `images/`. The set has to span what students will
actually upload, because the pipeline's thresholds are calibrated against it
and the gate is only meaningful if the corpus is honest:

- clean, well-lit, roughly square pages (the common case),
- pages photographed at an angle (skew for the Hough stage to recover),
- uneven lighting and hard shadows (for illumination correction),
- a few genuinely unreadable pages: too blurry, too dark, and a blank sheet,
  which must trip the early-rejection gates.

Photos only. Synthetic images do not exercise real sensor noise, EXIF
orientation tags, compression artefacts, or handwriting, so they cannot stand
in for this asset (the deterministic synthetic tests in `tests/pipeline.rs`
cover the algorithms; this corpus covers reality). This is why the corpus
cannot be generated and must be captured; see docs/decisions/0016.

## Naming

`NN_quality.ext`, sorted, so the manifest reads in order and the intent of
each photo is legible, for example `01_clean.jpg`, `18_skewed.jpg`,
`27_blurry.jpg`, `30_blank.jpg`.

## The expectations manifest

`expectations.json` maps each filename to its golden expectation:

- a readable page records the perceptual hash (dHash) of its grayscale
  rendition and a Hamming-distance tolerance:
  `{"accept": {"dhash": 12345, "max_distance": 6}}`,
- an unreadable page records the rejection reason code it must produce
  (`blurry`, `too_dark`, or `blank`): `{"reject": "blurry"}`.

The perceptual hash absorbs the harmless bit-level jitter of resampling while
still failing on a real change in the pipeline's output.

## Recording and updating the baseline

After adding or changing photos, regenerate the manifest, then read the diff
before committing (a changed hash is the pipeline telling you its output
moved; make sure you meant it):

    TIRO_RECORD=1 cargo test -p tirocinium-preprocess --test corpus

Until the photos land this directory holds only this README and an empty
manifest, and the golden test in `tests/corpus.rs` is a self-documenting
no-op so the gate stays green without pretending to verify absent data.
