"""Math delimiters in course markdown (decisions 0098 and 0099).

Every reader of course content (remark-math on the reading surfaces, and the
generation, verification, and proposal prompts, which write and expect dollars)
understands `$ ... $` and `$$ ... $$`. The transcription prompts write
`\\( ... \\)` and `\\[ ... \\]`, so an imported problem is normalised once, at
confirmation, where model output becomes course content. Only delimiters
change; the formula's own text passes through exactly, and code is left alone.

This is the twin of `normalizeMath` in `apps/web/src/components/reading/
markdown.ts`, which renders text still carrying brackets (staged items, student
transcriptions). Both are pinned against one case table,
`tests/fixtures/math-delimiters.json`, so they cannot drift.
"""

import re

_FENCE = re.compile(r"^\s{0,3}(`{3,}|~{3,})")
_LIST_ITEM = re.compile(r"^(\s*)([-*+]|\d{1,9}[.)])(\s+)")
_SINGLE_DISPLAY = re.compile(r"^\$\$(.+)\$\$$")
_BLANK_LINE = re.compile(r"\n[ \t]*\n")


def normalize_math(markdown: str) -> str:
    """Rewrite bracket delimiters as dollars, and give a `$$` formula written
    alone on one line its own display block. Idempotent."""
    out: list[str] = []
    prose: list[str] = []
    fence: str | None = None
    in_display = False

    def flush() -> None:
        if prose:
            out.append(_convert_brackets("\n".join(prose)))
            prose.clear()

    for line in markdown.split("\n"):
        trimmed = line.strip()
        if fence is not None:
            out.append(line)
            if trimmed.startswith(fence):
                fence = None
            continue
        if in_display:
            out.append(line)
            if trimmed.endswith("$$"):
                in_display = False
            continue
        opener = _FENCE.match(line)
        if opener:
            flush()
            fence = opener.group(1)
            out.append(line)
            continue
        if trimmed.startswith("$$"):
            flush()
            single = _SINGLE_DISPLAY.match(trimmed)
            if single and "$$" not in single.group(1):
                out.extend(_display_block(single.group(1), _leading_space(line)))
            else:
                out.append(line)
                if not (len(trimmed) > 2 and trimmed.endswith("$$")):
                    in_display = True
            continue
        prose.append(line)
    flush()
    return "\n".join(out)


def _leading_space(line: str) -> str:
    return line[: len(line) - len(line.lstrip())]


def _content_indent(line: str) -> str:
    """The indent a display needs to stay inside the list item its line opens
    or continues; anything less ends the item."""
    item = _LIST_ITEM.match(line)
    if item:
        return " " * len(item.group(0))
    return _leading_space(line)


def _display_block(tex: str, indent: str) -> list[str]:
    body = [indent + row.strip() for row in tex.strip().split("\n")]
    return ["", f"{indent}$$", *body, f"{indent}$$", ""]


def _find_unescaped(text: str, close: str, start: int) -> int:
    """Index of `close` at or after `start`, skipping escaped characters and
    never crossing a blank line (which ends the paragraph), or -1."""
    j = start
    while j < len(text):
        if text.startswith(close, j):
            return j
        if text[j] == "\\":
            j += 2
            continue
        if text[j] == "\n" and _BLANK_LINE.match(text, j):
            return -1
        j += 1
    return -1


def _convert_brackets(text: str) -> str:
    result = ""
    converted = False
    i = 0
    while i < len(text):
        ch = text[i]
        if ch == "\\":
            nxt = text[i + 1 : i + 2]
            if nxt in ("(", "["):
                close = "\\)" if nxt == "(" else "\\]"
                end = _find_unescaped(text, close, i + 2)
                if end != -1:
                    tex = text[i + 2 : end].strip()
                    if nxt == "(":
                        result += f"${tex}$"
                    else:
                        indent = _content_indent(result[result.rfind("\n") + 1 :])
                        result = result.rstrip()
                        result += "\n" + "\n".join(_display_block(tex, indent)) + "\n"
                    converted = True
                    i = end + 2
                    continue
            # Any other escape, including "\\", is copied whole so a "\\[1em]"
            # row gap is never read as a display opening.
            result += text[i : i + 2]
            i += 2
            continue
        if ch in ("`", "$"):
            run = re.match(rf"\{ch}+", text[i:])
            marker = run.group(0) if run else ch
            end = _find_unescaped(text, marker, i + len(marker))
            if end == -1 and ch == "$":
                # A dollar with no partner is literal (a price). Once a bracket
                # has become a dollar formula it would pair with that new
                # dollar, so it is escaped, which renders the same character.
                result += "\\$" * len(marker)
                i += len(marker)
                continue
            stop = i + len(marker) if end == -1 else end + len(marker)
            result += text[i:stop]
            i = stop
            continue
        result += ch
        i += 1
    # Nothing converted means nothing could pair with a stray dollar, so the
    # text is returned exactly as written.
    return result if converted else text
