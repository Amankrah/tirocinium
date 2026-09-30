"""Build a course pack's figure assets from the professor's materials folder.

The materials folder is gigabytes of lectures, videos and textbook scans and is
not in the repository, so it cannot be a load-time dependency: a pack that
reached into it would load on the machine that has it and fail everywhere else.
This script is the bridge that runs once, on a machine that does have the
folder, and commits the result.

It reads `figures.manifest.json` next to the pack, pulls each named figure out
of its source PDF with the platform's own deterministic extractor
(`platform_core.pdf.extract_figures`, the same one the import pipeline uses),
writes the bytes unaltered under `figures/`, and prints the `figures` array to
paste into the pack revision. Nothing is redrawn, re-encoded or described: an
embedded raster comes out of the PDF stream byte for byte, which is the
figures-are-pixels constraint honoured on the one path that creates a pack.

    .venv/bin/python scripts/extract_pack_figures.py bree-216 \
        --materials "/path/to/BREE 216"

Pass --check to verify the committed bytes still match the source rather than
rewriting them, which is what CI would run if the materials folder were ever
available to it.
"""

import argparse
import hashlib
import json
import sys
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.coursepack.schema import PACK_ROOT

# Where infra/provision-pdfium.sh puts the pinned native library. The pack
# extractor is a maintenance script, so it resolves this itself rather than
# going through the seam the running app uses.
DEFAULT_PDFIUM = (
    Path(__file__).resolve().parents[3]
    / "crates"
    / "platform_core"
    / "pdf"
    / "vendor"
    / "lib"
    / "libpdfium.so"
)


def _page_crop(source_pdf: Path, page_index: int, box: tuple[float, float, float, float]) -> Any:
    """Crop one hand-specified box out of a rendered page.

    The deterministic extractor clusters vector drawings, and on a dense
    two-column textbook page it merges a plot with the running head beside it.
    This is the escape hatch for that case and it is the same path the
    confirmation surface's add-a-box verb takes (decision 0031): render the
    page, then crop the raster with `platform_core.pdf.crop_figures`, which is
    a pure image operation and never a re-render of the figure itself.
    """
    import subprocess
    import tempfile

    from platform_core import pdf as _pdf

    with tempfile.TemporaryDirectory() as tmp:
        stem = Path(tmp) / "page"
        # poppler renders the page; the crop itself stays in the platform's
        # own code, which is the half the figures-are-pixels rule governs.
        subprocess.run(
            [
                "pdftoppm", "-r", "200", "-png",
                "-f", str(page_index + 1), "-l", str(page_index + 1),
                str(source_pdf), str(stem),
            ],
            check=True,
            capture_output=True,
        )
        rendered = next(Path(tmp).glob("page*.png"))
        page_png = rendered.read_bytes()

    _w, _h, regions = _pdf.crop_figures(page_png, [box])
    png, _x, _y, width, height = regions[0]
    return ("page_crop", box, width, height, "png", png, None, None)


def _select(figures: list[Any], rule: str) -> Any:
    """Pick one figure off a page. The rules are deliberately few and explicit:
    a manifest that says `largest_embedded_raster` states that the wanted thing
    is a picture the professor pasted in, and a slide's full-page vector render
    (its background and title chrome) is never that."""
    if rule.startswith("index:"):
        return figures[int(rule.split(":", 1)[1])]
    kind = {
        "largest_embedded_raster": "embedded_raster",
        "largest_vector_render": "vector_render",
    }[rule]
    candidates = [f for f in figures if f[0] == kind]
    if not candidates:
        raise ValueError(f"no {kind} on this page")
    return max(candidates, key=lambda f: f[2] * f[3])


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("pack_id")
    parser.add_argument("--materials", required=True, type=Path)
    parser.add_argument("--pdfium", type=Path, default=DEFAULT_PDFIUM)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()

    from platform_core import pdf as _pdf

    pack_dir = PACK_ROOT / args.pack_id
    manifest = json.loads((pack_dir / "figures.manifest.json").read_text("utf-8"))
    figures_dir = pack_dir / "figures"
    figures_dir.mkdir(parents=True, exist_ok=True)

    out: list[dict[str, Any]] = []
    failures = 0
    for entry in manifest:
        source_pdf = args.materials / entry["document"]
        page_index = int(entry["page"])
        page_width, page_height, figures = _pdf.extract_figures(
            source_pdf.read_bytes(), str(args.pdfium), page_index
        )
        rule = entry.get("select", "largest_embedded_raster")
        if rule.startswith("box:"):
            box = tuple(float(v) for v in rule[4:].split(","))
            picked = _page_crop(source_pdf, page_index, box)  # type: ignore[arg-type]
            # A hand-cropped box is already normalised to the page, so the
            # bbox is recorded as given rather than divided again.
            page_width = page_height = 1.0
        else:
            picked = _select(figures, rule)
        kind, bbox, width_px, height_px, fmt, image = picked[:6]
        content_hash = hashlib.sha256(image).hexdigest()
        name = f"{content_hash}.{fmt if fmt != 'jpeg' else 'jpg'}"
        path = figures_dir / name

        if args.check:
            if not path.exists() or hashlib.sha256(path.read_bytes()).hexdigest() != content_hash:
                print(f"MISMATCH {entry['key']}: {path}", file=sys.stderr)
                failures += 1
        else:
            path.write_bytes(image)

        out.append(
            {
                "key": entry["key"],
                "sha256": content_hash,
                "file": f"figures/{name}",
                "width_px": width_px,
                "height_px": height_px,
                "caption": entry.get("caption"),
                "source": {
                    "document": entry["document"],
                    "page": page_index,
                    "bbox": [
                        round(bbox[0] / page_width, 6),
                        round(bbox[1] / page_height, 6),
                        round(bbox[2] / page_width, 6),
                        round(bbox[3] / page_height, 6),
                    ],
                    "kind": kind,
                },
            }
        )

    if failures:
        return 1
    json.dump(out, sys.stdout, indent=2, ensure_ascii=False)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
