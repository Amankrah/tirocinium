# The PDF ingestion corpus

Five real problem-set PDFs (mixed born-digital and scanned, with schematics,
charts, and process diagrams), the Phase 4 gate's golden asset (backend guide
section 5; project phases 4). It is a captured, not generated, project asset:
place the PDFs under `pdfs/` (Git LFS routes `pdf` there already) and record the
expectations beside them as the gate for each milestone solidifies.

The corpus is empty for now. The harness in `tests/corpus.rs` is a
self-documenting no-op while `pdfs/` is empty, so the gate stays green without
verifying absent data. Decode needs the vendored pdfium binary
(`../vendor/bin/pdfium.dll`), which `infra/setup.sh` provisions; the no-op needs
nothing.

Scope by milestone: 4.1 (decode) exercises page classification and text
extraction; 4.2 (figure extraction) adds the byte-identical / hash-stable figure
round-trip and token positioning that the gate ultimately asserts.
