#!/usr/bin/env bash
# F0 build-time font probe (docs/48 §13.5). Fail fast if CJK fonts are unusable.
set -euo pipefail

# The deck's CSS stack is: "Noto Sans CJK SC", "Noto Sans SC", "Microsoft YaHei", sans-serif.
# Debian's fonts-noto-cjk exposes "Noto Sans CJK SC"; Google Fonts builds expose
# "Noto Sans SC". Accept either, but require the family to resolve exactly — a
# wildcard fallback is exactly the "looks green, renders tofu" trap.
probe_family() {
  local requested="$1"
  local matched
  matched="$(fc-match --format='%{family}' "$requested" | head -n1 | tr -d '\n')"
  if [[ -z "$matched" ]]; then
    echo "fc-match failed for ${requested}: empty result" >&2
    return 1
  fi
  if [[ "$matched" != *"${requested}"* ]]; then
    echo "fc-match failed for ${requested}: got ${matched}" >&2
    return 1
  fi
  echo "fc-match ok: ${requested} -> ${matched}"
}

if ! probe_family "Noto Sans CJK SC" 2>/dev/null; then
  # Accept the Google Fonts build as well.
  probe_family "Noto Sans SC"
fi

zh_count="$(fc-list :lang=zh family 2>/dev/null | wc -l | tr -d ' ')"
if [[ "${zh_count:-0}" -lt 1 ]]; then
  echo "fc-list :lang=zh returned no fonts" >&2
  exit 1
fi
echo "fc-list :lang=zh families: ${zh_count}"

PROBE_DIR="$(mktemp -d)"
trap 'rm -rf "$PROBE_DIR"' EXIT
PROBE_HTML="${PROBE_DIR}/probe.html"
cat >"$PROBE_HTML" <<'HTML'
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <style>
    body {
      margin: 0;
      width: 1280px;
      height: 720px;
      font-family: "Noto Sans CJK SC", "Noto Sans SC", "Microsoft YaHei", sans-serif;
      font-size: 48px;
      background: #fff;
      color: #111;
      display: flex;
      align-items: center;
      justify-content: center;
    }
  </style>
</head>
<body>中文测试：税务管理 0-9</body>
</html>
HTML

PROBE_PNG="${PROBE_DIR}/probe.png"
if command -v chromium >/dev/null 2>&1; then
  chromium --headless=new --disable-gpu --no-sandbox --hide-scrollbars \
    --screenshot="${PROBE_PNG}" --window-size=1280,720 "file://${PROBE_HTML}" 2>/dev/null \
    || chromium --headless --disable-gpu --no-sandbox --hide-scrollbars \
    --screenshot="${PROBE_PNG}" --window-size=1280,720 "file://${PROBE_HTML}"
  if [[ ! -s "$PROBE_PNG" ]]; then
    echo "chromium probe screenshot empty" >&2
    exit 1
  fi
  if command -v python3 >/dev/null 2>&1; then
    ratio="$(PROBE_PNG="$PROBE_PNG" python3 - <<'PY'
import os
from pathlib import Path
try:
    from PIL import Image
except ImportError:
    print("skip")
    raise SystemExit(0)
img = Image.open(Path(os.environ["PROBE_PNG"]))
w, h = img.size
dark = 0
pixels = w * h
for y in range(h):
    for x in range(w):
        r, g, b = img.getpixel((x, y))[:3]
        if r < 250 or g < 250 or b < 250:
            dark += 1
print(dark / pixels if pixels else 0)
PY
)"
    if [[ "$ratio" != "skip" ]]; then
      python3 -c "
ratio = float('${ratio}')
import sys
if ratio < 0.005:
    print(f'non-blank pixel ratio {ratio:.4f} < 0.5%', file=sys.stderr)
    sys.exit(1)
print(f'non-blank pixel ratio {ratio:.4f}')
"
    fi
  fi
  echo "chromium CJK probe screenshot ok"
else
  echo "chromium not found; skipping raster probe (fc-match only)" >&2
fi

echo "font-probe-f0: PASS"
