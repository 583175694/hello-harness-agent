#!/usr/bin/env python3
"""Zero-dependency PPTX content checker for the AI PPT pipeline.

Complements pixel diff: catches the failure mode where every CJK glyph is
missing while MAE still looks good (see docs/48 §12.0).

Usage:
  python3 scripts/ppt-unpack-check.py deck.pptx
  python3 scripts/ppt-unpack-check.py deck.pptx --html deck.html
  python3 scripts/ppt-unpack-check.py deck.pptx --json out.json --strict

Exit code is non-zero only with --strict and a failed hard check.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import zipfile
from collections import Counter
from pathlib import Path

SLIDE_RE = re.compile(r"^ppt/slides/slide\d+\.xml$")
RUN_RE = re.compile(r"<a:t>(.*?)</a:t>", re.S)
TYPE_RE = re.compile(r'<(?:a:latin|a:ea|a:cs)\s+typeface="([^"]*)"')
TBL_RE = re.compile(r"<a:tbl>")
TXBODY_RE = re.compile(r"<p:txBody>")
TBL_BLOCK_RE = re.compile(r"<a:tbl>.*?</a:tbl>", re.S)
SLD_SZ_RE = re.compile(r'<p:sldSz\s+cx="(\d+)"\s+cy="(\d+)"')
CJK_RE = re.compile(r"[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]")

BLACKLIST = {"-apple-system", "system-ui", "BlinkMacSystemFont", "PingFang SC"}
EMU_16_9 = (12192000, 6858000)

# Hard thresholds mirror docs/48 §13.8 checks 2-6.
MIN_CJK_COVERAGE = 0.99
MIN_CANVAS_TOLERANCE = 20000


def unescape(text: str) -> str:
    return (
        text.replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", '"')
        .replace("&apos;", "'")
        .replace("&amp;", "&")
    )


# UI chrome that never appears in a slide: blocks with display:none or
# position:fixed (the deck's 翻页 hint). Excluded from the "expected visible
# text" side, because the exporter correctly drops them.
BLOCK_RE = re.compile(r"\.([\w-]+)\s*\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}", re.S)
HIDDEN_DECL_RE = re.compile(r"(?:display\s*:\s*none|position\s*:\s*fixed)", re.I)
# dom-to-pptx exports document.querySelectorAll(".slide") only. Speaker notes or
# preview chrome must not count toward expected CJK or decks with notes outside
# slides always fail at ~70–80% while slide text is complete.
SLIDE_BLOCK_RE = re.compile(
    r'<([a-zA-Z][\w-]*)\b[^>]*\bclass="[^"]*\bslide\b[^"]*"[^>]*>.*?</\1>',
    re.S | re.I,
)


def hidden_classes(source: str) -> set[str]:
    return {
        name
        for name, declarations in BLOCK_RE.findall(source)
        if HIDDEN_DECL_RE.search(declarations)
    }


def strip_hidden(body: str, source: str) -> str:
    """Drop UI chrome that is intentionally absent from the export.

    Counting it as "missing text" would understate coverage and hide real
    regressions (the sample deck has a fixed 翻页 hint on every page).
    """
    for class_name in hidden_classes(source):
        body = re.sub(
            rf'<([a-zA-Z][\w-]*)\b[^>]*class="[^"]*\b{re.escape(class_name)}\b[^"]*"[^>]*>.*?</\1>',
            " ",
            body,
            flags=re.S,
        )
    return body


def extract_slide_blocks(body: str) -> str:
    return " ".join(match.group(0) for match in SLIDE_BLOCK_RE.finditer(body))


def html_cjk_metrics(*, path: Path | None = None, source: str | None = None) -> tuple[Counter, int]:
    if (path is None) == (source is None):
        raise ValueError("provide exactly one of path or source")
    if path is not None:
        source = path.read_text(encoding="utf-8", errors="replace")
    assert source is not None
    # CSS lives inside <head>, so extract it before <head> is dropped.
    styles = " ".join(re.findall(r"<style\b.*?</style>", source, flags=re.S | re.I))
    # <head> text (title, meta) is never rendered, so it must not count as
    # "expected visible text".
    source = re.sub(r"<head\b.*?</head>", " ", source, flags=re.S | re.I)
    body = re.sub(r"<style\b.*?</style>", " ", source, flags=re.S | re.I)
    body = re.sub(r"<script\b.*?</script>", " ", body, flags=re.S | re.I)
    body = re.sub(r"<!--.*?-->", " ", body, flags=re.S)
    # Hidden-class detection needs the CSS, so it is passed separately.
    body = strip_hidden(body, styles)
    slide_markup = extract_slide_blocks(body)
    outside = SLIDE_BLOCK_RE.sub(" ", body)
    outside_count = len(CJK_RE.findall(re.sub(r"<[^>]+>", " ", outside)))
    expected = Counter(CJK_RE.findall(re.sub(r"<[^>]+>", " ", slide_markup)))
    return expected, outside_count


def html_cjk(path: Path) -> Counter:
    expected, _ = html_cjk_metrics(path=path)
    return expected


def check(pptx: Path, html: Path | None) -> dict:
    with zipfile.ZipFile(pptx) as archive:
        names = archive.namelist()
        slides = sorted(name for name in names if SLIDE_RE.match(name))
        if not slides:
            raise SystemExit(f"no slides found in {pptx}")

        xml = "".join(archive.read(name).decode("utf-8", "replace") for name in slides)
        presentation = archive.read("ppt/presentation.xml").decode("utf-8", "replace")

    runs = [unescape(match) for match in RUN_RE.findall(xml)]
    typefaces = Counter(TYPE_RE.findall(xml))
    free_text_bodies = len(TXBODY_RE.findall(TBL_BLOCK_RE.sub(" ", xml)))
    sld_sz = SLD_SZ_RE.search(presentation)

    result: dict = {
        "file": pptx.name,
        "slides": len(slides),
        "tables": len(TBL_RE.findall(xml)),
        "runs": len(runs),
        "freeTextBodies": free_text_bodies,
        "chars": sum(len(run) for run in runs),
        "typefaces": dict(typefaces.most_common()),
        "blacklistedTypefaces": sorted(set(typefaces) & BLACKLIST),
        "pictures": xml.count("<p:pic>"),
        "groups": xml.count("<p:grpSp>"),
        "sldSz": (
            {"cx": int(sld_sz.group(1)), "cy": int(sld_sz.group(2))} if sld_sz else None
        ),
    }

    if html is not None:
        expected, outside = html_cjk_metrics(path=html)
        produced = Counter(CJK_RE.findall("".join(runs)))
        total = sum(expected.values())
        missing = sum(max(0, count - produced.get(char, 0)) for char, count in expected.items())
        result["cjkScope"] = "slide_only"
        result["htmlCjkTotal"] = total
        result["htmlCjkOutsideSlides"] = outside
        result["pptxCjkTotal"] = sum(produced.values())
        result["cjkCoverage"] = round(1 - missing / total, 4) if total else None
        result["missingCjk"] = (
            sorted(
                ((char, count - produced.get(char, 0)) for char, count in expected.items() if count > produced.get(char, 0)),
                key=lambda item: -item[1],
            )[:20]
            if total
            else []
        )

    failures = []
    if result["blacklistedTypefaces"]:
        failures.append(f"blacklisted typefaces: {result['blacklistedTypefaces']}")
    if result["sldSz"] is None:
        failures.append("missing sldSz")
    elif any(
        abs(actual - wanted) > MIN_CANVAS_TOLERANCE
        for actual, wanted in zip((result["sldSz"]["cx"], result["sldSz"]["cy"]), EMU_16_9)
    ):
        failures.append(f"canvas {result['sldSz']} is not 13.333x7.5in")
    coverage = result.get("cjkCoverage")
    if coverage is not None and coverage < MIN_CJK_COVERAGE:
        failures.append(f"cjk coverage {coverage:.2%} < {MIN_CJK_COVERAGE:.0%}")

    result["failedChecks"] = failures
    result["passed"] = not failures
    return result


def run_selftest() -> None:
    sample = """
    <html><body>
      <section class="slide"><p>幻灯片正文甲乙丙</p></section>
      <div class="notes"><p>讲稿备注一二三四五六七八九十</p></div>
    </body></html>
    """
    expected, outside = html_cjk_metrics(source=sample)
    slide_total = sum(expected.values())
    if slide_total != 8 or outside != 14:
        raise AssertionError(
            f"expected slide CJK=8 and outside=14, got slide={slide_total} outside={outside}"
        )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("pptx", type=Path, nargs="?")
    parser.add_argument("--html", type=Path, help="source HTML, enables CJK coverage check")
    parser.add_argument("--json", type=Path, help="also write the report as JSON")
    parser.add_argument("--strict", action="store_true", help="exit 1 when a hard check fails")
    parser.add_argument("--selftest", action="store_true", help="run built-in CJK scope checks")
    args = parser.parse_args()

    if args.selftest:
        run_selftest()
        print(json.dumps({"selftest": "ok"}, ensure_ascii=False))
        return 0
    if args.pptx is None:
        parser.error("pptx is required unless --selftest is set")

    report = check(args.pptx, args.html)
    text = json.dumps(report, ensure_ascii=False, indent=2)
    print(text)
    if args.json:
        args.json.write_text(text + "\n", encoding="utf-8")
    return 0 if report["passed"] or not args.strict else 1


if __name__ == "__main__":
    sys.exit(main())
