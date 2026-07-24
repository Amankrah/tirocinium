# Mirrors crates/platform_core/pdf/src/python.rs. Decode a PDF's pages with
# pdfium, loaded at runtime from the vendored library at lib_path. Each page is
# (page_index, kind, text_markdown | None, image_png), where kind is
# 'born_digital' or 'scanned' and image_png is a rendered raster of the page.

def decode(
    pdf: bytes, lib_path: str, render_width: int = 1654
) -> list[tuple[int, str, str | None, bytes]]: ...

# extract_figures returns (page_width, page_height, figures) in page points.
# Each figure is (source, bbox [x,y,w,h], width_px, height_px, format, image,
# image_2x, caption); source is 'embedded_raster' | 'vector_render' |
# 'page_crop', format is 'jpeg' | 'png'.
def extract_figures(
    pdf: bytes, lib_path: str, page_index: int
) -> tuple[
    float,
    float,
    list[
        tuple[
            str,
            tuple[float, float, float, float],
            int,
            int,
            str,
            bytes,
            bytes | None,
            str | None,
        ]
    ],
]: ...

# crop_figures crops a page raster at normalized boxes ([x,y,w,h] in 0..1) for
# the vision detector's page_crop figures. Returns (page_width, page_height,
# regions), each region (png, x, y, w, h) in page pixels.
def crop_figures(
    page_png: bytes, boxes: list[tuple[float, float, float, float]]
) -> tuple[int, int, list[tuple[bytes, int, int, int, int]]]: ...
