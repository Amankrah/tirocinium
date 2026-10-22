# Recorded supplier desk replies

Recorded replies for the marketplace's supplier desk (decision 0108), one JSON
file per fact sheet, named for `document_key` of the exact fact sheet the
model was shown (the sheet `rfq_document` assembles, with its fence nonce
canonicalised out). `RecordedSupplierDesk` (app/marketplace/supplier.py)
replays them so the suite exercises the reply flow without calling a live
model (model calls in tests are recorded, always).

Each file is a JSON object matching `SupplierReply`: `subject`, `opening`,
`offer`, `questions`, `notes`, `alternatives` (each with `sku` and `reason`)
and `closing`. The supplier tests build theirs in memory, so the gate needs no
committed asset; this is where replies captured by
`scripts/smoke_supplier_reply.py` land once they have been reviewed.
