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
from html.parser import HTMLParser
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
VOID_TAGS = frozenset(
    {
        "area",
        "base",
        "br",
        "col",
        "embed",
        "hr",
        "img",
        "input",
        "link",
        "meta",
        "param",
        "source",
        "track",
        "wbr",
    }
)
SKIP_TEXT_TAGS = frozenset({"head", "style", "script", "noscript", "template"})


def hidden_classes(source: str) -> set[str]:
    return {
        name
        for name, declarations in BLOCK_RE.findall(source)
        if HIDDEN_DECL_RE.search(declarations)
    }


class _SlideCjkParser(HTMLParser):
    """Track nested .slide and hidden containers accurately using a tag stack.

    A regex like ``<div class="slide">.*?</div>`` truncates at the first inner
    ``</div>`` whenever a slide uses ``<div class="slide">`` instead of
    ``<section class="slide">``, miscounting slide text as outside-slide text.
    """

    def __init__(self, hidden: set[str]) -> None:
        super().__init__(convert_charrefs=True)
        self._hidden = hidden
        self._stack: list[tuple[str, int, int, int]] = []
        self._slide_depth = 0
        self._hidden_depth = 0
        self._skip_depth = 0
        self.expected: Counter = Counter()
        self.outside_count = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        tag_lower = tag.lower()
        if tag_lower in VOID_TAGS:
            return
        attr_map = {k.lower(): (v or "") for k, v in attrs}
        classes = set(attr_map.get("class", "").split())
        d_slide = 1 if "slide" in classes else 0
        d_hidden = (
            1
            if (classes & self._hidden) or HIDDEN_DECL_RE.search(attr_map.get("style", ""))
            else 0
        )
        d_skip = 1 if tag_lower in SKIP_TEXT_TAGS else 0
        self._stack.append((tag_lower, d_slide, d_hidden, d_skip))
        self._slide_depth += d_slide
        self._hidden_depth += d_hidden
        self._skip_depth += d_skip

    def handle_startendtag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        return

    def handle_endtag(self, tag: str) -> None:
        tag_lower = tag.lower()
        if tag_lower in VOID_TAGS:
            return
        for idx in range(len(self._stack) - 1, -1, -1):
            if self._stack[idx][0] == tag_lower:
                while len(self._stack) > idx:
                    _, d_slide, d_hidden, d_skip = self._stack.pop()
                    self._slide_depth -= d_slide
                    self._hidden_depth -= d_hidden
                    self._skip_depth -= d_skip
                return

    def handle_data(self, data: str) -> None:
        if self._skip_depth > 0 or self._hidden_depth > 0:
            return
        chars = CJK_RE.findall(data)
        if not chars:
            return
        if self._slide_depth > 0:
            self.expected.update(chars)
        else:
            self.outside_count += len(chars)


def html_cjk_metrics(*, path: Path | None = None, source: str | None = None) -> tuple[Counter, int]:
    if (path is None) == (source is None):
        raise ValueError("provide exactly one of path or source")
    if path is not None:
        source = path.read_text(encoding="utf-8", errors="replace")
    assert source is not None
    # CSS lives inside <style>, so extract hidden classes before parsing the document.
    styles = " ".join(re.findall(r"<style\b.*?</style>", source, flags=re.S | re.I))
    parser = _SlideCjkParser(hidden_classes(styles))
    parser.feed(source)
    parser.close()
    return parser.expected, parser.outside_count


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

    nested_div_slide = """
    <html><head><title>不计入标题</title><style>
      .hint { position: fixed; }
      .hidden { display: none; }
    </style></head><body>
      <div class="slide">
        <div class="top-bar"></div>
        <div class="slide-body"><p>税务体系与高企治理<br><img src="a.png">正文</p></div>
        <div class="hidden"><span>隐藏文字</span></div>
      </div>
      <div class="hint"><span>翻页提示</span></div>
      <div class="slide-header">幻灯片外字</div>
    </body></html>
    """
    nested_expected, nested_outside = html_cjk_metrics(source=nested_div_slide)
    nested_total = sum(nested_expected.values())
    if nested_total != 11 or nested_outside != 5:
        raise AssertionError(
            f"expected nested div.slide CJK=11 and outside=5, got slide={nested_total} outside={nested_outside}"
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
