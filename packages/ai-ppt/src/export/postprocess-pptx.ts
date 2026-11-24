import JSZip from 'jszip';

const SLIDE_WIDTH_EMU = 12_192_000; // 13.333 in
const SLIDE_HEIGHT_EMU = 6_858_000; // 7.5 in
const SLIDE_XML_RE = /^ppt\/slides\/slide\d+\.xml$/u;

const DEFAULT_FONT_MAP: Record<string, string> = {
  'Noto Sans CJK SC': 'Microsoft YaHei',
};

export type PostprocessPptxOptions = {
  /**
   * XML 内字体名映射（默认将 Linux 专有字体名 `Noto Sans CJK SC` 映射为
   * 跨端兼容性更好的 `Microsoft YaHei`，消除 WPS 缺字体告警与字宽膨胀）。
   * 传入 `{}` 可禁用字体映射。
   */
  fontMap?: Record<string, string>;
};

export function isZipBuffer(buffer: Buffer): boolean {
  return buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b;
}

/**
 * 对 dom-to-pptx 产出的 PPTX 做轻量级 OOXML 后处理，修正 3 类跨端（尤其是 WPS）失真：
 *   1. 多行文本框（`wrap="square"`）：移除 `<a:spAutoFit/>` 改为 `<a:noAutofit/>`，
 *      并为纯正文文本框增加少量高度余量，防止 WPS 框高塌缩至 1 行导致文字溢出。
 *   2. 固定点数行距（`<a:spcPts>`）：按 0.90 系数适度收紧偏松行距（保底 1.15× 字号），
 *      抵消 WPS/PowerPoint 绝对行距偏大把正文顶出卡片底边的问题。
 *   3. 单行文本框（`wrap="none"`）：按段落对齐方式扩宽 `cx`（右对齐锁死右边界向左扩、
 *      居中双向扩、左对齐向右扩），消除字体回退时文字溢出窄框与右边界不齐。
 *   4. 字体名跨端映射：将 `Noto Sans CJK SC` 映射为 `Microsoft YaHei`。
 */
export async function postprocessPptxBuffer(
  buffer: Buffer,
  options: PostprocessPptxOptions = {},
): Promise<Buffer> {
  if (!isZipBuffer(buffer)) return buffer;

  const fontMap = options.fontMap ?? DEFAULT_FONT_MAP;
  const zip = await JSZip.loadAsync(buffer);

  const slidePaths = Object.keys(zip.files).filter((name) => SLIDE_XML_RE.test(name));
  for (const slidePath of slidePaths) {
    const file = zip.file(slidePath);
    if (!file) continue;
    const xml = await file.async('string');
    const patched = postprocessSlideXml(xml, fontMap);
    if (patched !== xml) {
      zip.file(slidePath, patched);
    }
  }

  return zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
}

export function postprocessSlideXml(
  xml: string,
  fontMap: Record<string, string> = DEFAULT_FONT_MAP,
): string {
  const containers = collectVisualContainers(xml);
  let shapeOrder = 0;

  let result = xml.replace(/<p:sp\b[\s\S]*?<\/p:sp>/gu, (shapeXml) => {
    const order = shapeOrder;
    shapeOrder += 1;
    return patchTextShape(shapeXml, order, containers);
  });

  for (const [from, to] of Object.entries(fontMap)) {
    if (!from || !to || from === to) continue;
    const escaped = escapeRegExp(from);
    result = result.replace(
      new RegExp(`(<(?:a:latin|a:ea|a:cs)\\b[^>]*\\btypeface=")${escaped}(")`, 'gu'),
      `$1${to}$2`,
    );
  }

  return result;
}

type ShapeBox = { x: number; y: number; cx: number; cy: number };
type ContainerEntry = ShapeBox & { order: number };

const XFRM_RE =
  /(<a:xfrm\b[^>]*>[\s\S]*?<a:off\s+x=")(-?\d+)("\s+y=")(-?\d+)("\s*\/>\s*<a:ext\s+cx=")(\d+)("\s+cy=")(\d+)("\s*\/>)/u;
const CONTAIN_TOLERANCE_EMU = 9_525; // 1 px
const CONTAINER_INSET_EMU = 57_150; // 6 px

function hasVisualBoxStyle(shapeXml: string): boolean {
  const spPrMatch = /<p:spPr\b[^>]*>([\s\S]*?)<\/p:spPr>/u.exec(shapeXml);
  const spPr = spPrMatch?.[1] ?? '';
  const hasVisibleLine =
    /<a:ln\b[^>]*>[\s\S]*?<a:(?:solidFill|gradFill|pattFill)\b[\s\S]*?<\/a:ln>/u.test(spPr) ||
    /<a:ln\b[^>]*\bw="[^"]+"\s*\/>/u.test(spPr);
  const spPrWithoutLn = spPr.replace(/<a:ln\b[\s\S]*?<\/a:ln>/gu, '');
  const hasVisibleFill = /<a:(?:solidFill|gradFill|pattFill|blipFill)\b/u.test(spPrWithoutLn);
  return hasVisibleFill || hasVisibleLine;
}

function readShapeBox(shapeXml: string): ShapeBox | null {
  const match = XFRM_RE.exec(shapeXml);
  if (!match) return null;
  return {
    x: Number.parseInt(match[2] ?? '0', 10),
    y: Number.parseInt(match[4] ?? '0', 10),
    cx: Number.parseInt(match[6] ?? '0', 10),
    cy: Number.parseInt(match[8] ?? '0', 10),
  };
}

function collectVisualContainers(xml: string): ContainerEntry[] {
  const containers: ContainerEntry[] = [];
  let order = 0;
  for (const match of xml.matchAll(/<p:sp\b[\s\S]*?<\/p:sp>/gu)) {
    const shapeXml = match[0];
    if (hasVisualBoxStyle(shapeXml)) {
      const box = readShapeBox(shapeXml);
      if (
        box &&
        !(box.cx >= SLIDE_WIDTH_EMU * 0.98 && box.cy >= SLIDE_HEIGHT_EMU * 0.98)
      ) {
        containers.push({ ...box, order });
      }
    }
    order += 1;
  }
  return containers;
}

function findContainingBox(
  box: ShapeBox,
  order: number,
  containers: ContainerEntry[],
): ContainerEntry | undefined {
  let best: ContainerEntry | undefined;
  let bestArea = Infinity;
  const right = box.x + box.cx;
  const bottom = box.y + box.cy;

  for (const c of containers) {
    if (c.order >= order) break;
    if (
      c.x <= box.x + CONTAIN_TOLERANCE_EMU &&
      c.x + c.cx >= right - CONTAIN_TOLERANCE_EMU &&
      c.y <= box.y + CONTAIN_TOLERANCE_EMU &&
      c.y + c.cy >= bottom - CONTAIN_TOLERANCE_EMU
    ) {
      const area = c.cx * c.cy;
      if (area < bestArea) {
        bestArea = area;
        best = c;
      }
    }
  }
  return best;
}

function horizontalBoundsForShape(
  box: ShapeBox,
  order: number,
  containers: ContainerEntry[],
): { minX: number; maxRight: number } {
  const parent = findContainingBox(box, order, containers);
  if (!parent) return { minX: 0, maxRight: SLIDE_WIDTH_EMU };

  const originalLeftGap = Math.max(0, box.x - parent.x);
  const originalRightGap = Math.max(0, parent.x + parent.cx - (box.x + box.cx));
  const rightInset = Math.min(
    originalRightGap,
    Math.min(originalLeftGap, CONTAINER_INSET_EMU),
  );
  const leftInset = Math.min(
    originalLeftGap,
    Math.min(originalRightGap, CONTAINER_INSET_EMU),
  );

  return {
    minX: Math.min(box.x, parent.x + leftInset),
    maxRight: Math.max(box.x + box.cx, parent.x + parent.cx - rightInset),
  };
}

function patchTextShape(
  shapeXml: string,
  order: number,
  containers: ContainerEntry[],
): string {
  if (!shapeXml.includes('<p:txBody>')) return shapeXml;
  if (!shapeXml.includes('<a:t>')) return shapeXml;

  const bodyPrMatch = /<a:bodyPr\b([^>]*)>([\s\S]*?)<\/a:bodyPr>/u.exec(shapeXml);
  const bodyPrAttrs = bodyPrMatch?.[1] ?? '';
  const wrapMatch = /\bwrap="(square|none)"/u.exec(bodyPrAttrs);
  const wrapMode = wrapMatch?.[1];
  const hasVisualBox = hasVisualBoxStyle(shapeXml);

  let updated = shapeXml;

  // 1. 校准固定点数行距 <a:spcPts>
  updated = updated.replace(/<a:p\b[^>]*>[\s\S]*?<\/a:p>/gu, (paraXml) =>
    calibrateParagraphLineSpacing(paraXml),
  );

  const box = readShapeBox(updated);
  const bounds = box
    ? horizontalBoundsForShape(box, order, containers)
    : { minX: 0, maxRight: SLIDE_WIDTH_EMU };

  // 2. 多行文本框：移除 <a:spAutoFit/> 并为纯正文/列表文本框增加高/宽余量（夹紧在父容器内）
  if (wrapMode === 'square') {
    updated = updated.replace(/<a:spAutoFit\s*\/>/gu, '<a:noAutofit/>');
    if (!hasVisualBox) {
      updated = patchShapeBox(updated, ({ x, y, cx, cy }) => {
        const extraW = Math.round(cx * 0.05);
        const extraH = Math.max(Math.round(cy * 0.12), 45_720);
        const newCx = Math.min(bounds.maxRight - x, cx + extraW);
        const newCy = Math.min(SLIDE_HEIGHT_EMU - y, cy + extraH);
        return { x, y, cx: Math.max(cx, newCx), cy: Math.max(cy, newCy) };
      });
    }
    return updated;
  }

  // 3. 单行文本框（wrap="none"）：按对齐方式扩宽，锁定对齐锚点并夹紧在父容器内
  if (wrapMode === 'none') {
    const algnMatch = /<a:pPr\b[^>]*\balgn="(l|r|ctr|just)"/u.exec(updated);
    const algn = algnMatch?.[1] ?? 'l';
    updated = patchShapeBox(updated, ({ x, y, cx, cy }) => {
      const delta = hasVisualBox
        ? Math.max(Math.round(cx * 0.08), 76_200)
        : Math.max(Math.round(cx * 0.18), 140_000);

      if (algn === 'r') {
        const rightEdge = x + cx;
        const newX = Math.max(bounds.minX, x - delta);
        return { x: newX, y, cx: Math.max(cx, rightEdge - newX), cy };
      }
      if (algn === 'ctr') {
        const half = Math.round(delta / 2);
        const newX = Math.max(bounds.minX, x - half);
        const newCx = Math.min(bounds.maxRight - newX, cx + delta);
        return { x: newX, y, cx: Math.max(cx, newCx), cy };
      }
      const newCx = Math.min(bounds.maxRight - x, cx + delta);
      return { x, y, cx: Math.max(cx, newCx), cy };
    });
  }

  return updated;
}

function calibrateParagraphLineSpacing(paraXml: string): string {
  const spcMatch = /<a:lnSpc>\s*<a:spcPts\s+val="(\d+)"\s*\/>\s*<\/a:lnSpc>/u.exec(paraXml);
  if (!spcMatch) return paraXml;

  const spcVal = Number.parseInt(spcMatch[1] ?? '0', 10);
  if (!Number.isFinite(spcVal) || spcVal <= 0) return paraXml;

  let maxFontSize = 0;
  for (const match of paraXml.matchAll(/<a:rPr\b[^>]*\bsz="(\d+)"/gu)) {
    const sz = Number.parseInt(match[1] ?? '0', 10);
    if (sz > maxFontSize) maxFontSize = sz;
  }
  if (maxFontSize <= 0 || spcVal <= maxFontSize * 1.25) return paraXml;

  const adjusted = Math.max(Math.round(spcVal * 0.9), Math.round(maxFontSize * 1.15));
  return paraXml.replace(
    spcMatch[0],
    `<a:lnSpc><a:spcPts val="${adjusted}"/></a:lnSpc>`,
  );
}

function patchShapeBox(
  shapeXml: string,
  transform: (box: ShapeBox) => ShapeBox,
): string {
  const box = readShapeBox(shapeXml);
  if (!box) return shapeXml;
  const next = transform(box);

  return shapeXml.replace(
    XFRM_RE,
    `$1${next.x}$3${next.y}$5${next.cx}$7${next.cy}$9`,
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}
