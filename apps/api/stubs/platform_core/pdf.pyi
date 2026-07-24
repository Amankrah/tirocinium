# Mirrors crates/platform_core/pdf/src/python.rs. Decode a PDF's pages with
# pdfium, loaded at runtime from the vendored library at lib_path. Each page is
# (page_index, kind, text_markdown | None, image_png), where kind is
# 'born_digital' or 'scanned' and image_png is a rendered raster of the page.

def decode(
    pdf: bytes, lib_path: str, render_width: int = 1654
) -> list[tuple[int, str, str | None, bytes]]: ...
