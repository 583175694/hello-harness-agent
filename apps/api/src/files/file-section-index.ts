/** 解析阶段写入 File.overview.sections 的稳定 Section 索引（与 parser 版本绑定）。 */
export type FileSectionIndexEntry = {
  sectionId: string;
  title?: string;
  level?: number;
  startLine: number;
  endLine: number;
  pageStart?: number;
  pageEnd?: number;
};

export type FileSectionIndex = {
  version: 'c1-read-v1';
  sections: FileSectionIndexEntry[];
};

const HEADING_RE = /^(#{1,6})\s+(.+)$/u;
const PAGE_MARKER_RE = /^\[\[page:(\d+)\]\]$/u;

function pageAtLine(lines: string[], lineIndex: number): number | undefined {
  let page: number | undefined;
  for (let index = 0; index <= lineIndex; index += 1) {
    const marker = lines[index]?.match(PAGE_MARKER_RE);
    if (marker) page = Number(marker[1]);
  }
  return page;
}

function assignSectionId(startLine: number, ordinal: number): string {
  return `s-${startLine}-${ordinal}`;
}

function finalizeSection(
  sections: FileSectionIndexEntry[],
  startLine: number,
  endLine: number,
  title: string | undefined,
  level: number | undefined,
  lines: string[],
): void {
  if (endLine < startLine) return;
  sections.push({
    sectionId: assignSectionId(startLine, sections.length),
    ...(title ? { title } : {}),
    ...(level !== undefined ? { level } : {}),
    startLine,
    endLine,
    pageStart: pageAtLine(lines, startLine - 1),
    pageEnd: pageAtLine(lines, endLine - 1),
  });
}

/** 从规范化正文构建 Section 索引；Markdown 标题优先，纯文本按空行段落降级。 */
export function buildSectionIndex(
  normalizedContent: string,
  fileKind: string,
): FileSectionIndex {
  const lines = normalizedContent.split('\n');
  if (lines.length === 0) {
    return { version: 'c1-read-v1', sections: [] };
  }

  const sections: FileSectionIndexEntry[] = [];
  const hasMarkdownHeadings = lines.some((line) => HEADING_RE.test(line));

  if (hasMarkdownHeadings || fileKind === 'markdown') {
    let currentStart = 1;
    let currentTitle: string | undefined;
    let currentLevel: number | undefined;
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index] ?? '';
      const heading = line.match(HEADING_RE);
      if (!heading) continue;
      const level = heading[1]!.length;
      const title = heading[2]!.trim();
      if (currentTitle !== undefined || index > 0) {
        finalizeSection(sections, currentStart, index, currentTitle, currentLevel, lines);
      }
      currentStart = index + 1;
      currentTitle = title;
      currentLevel = level;
    }
    finalizeSection(sections, currentStart, lines.length, currentTitle, currentLevel, lines);
  } else if (fileKind === 'pdf') {
    let pageStartLine = 1;
    let pageStart: number | undefined;
    for (let index = 0; index < lines.length; index += 1) {
      const marker = lines[index]?.match(PAGE_MARKER_RE);
      if (!marker) continue;
      const page = Number(marker[1]);
      if (pageStart !== undefined && index >= pageStartLine) {
        sections.push({
          sectionId: assignSectionId(pageStartLine, sections.length),
          title: pageStart !== undefined ? `Page ${pageStart}` : undefined,
          startLine: pageStartLine,
          endLine: index,
          pageStart,
          pageEnd: pageStart,
        });
      }
      pageStart = page;
      pageStartLine = index + 2;
    }
    if (pageStart !== undefined && pageStartLine <= lines.length) {
      sections.push({
        sectionId: assignSectionId(pageStartLine, sections.length),
        title: `Page ${pageStart}`,
        startLine: pageStartLine,
        endLine: lines.length,
        pageStart,
        pageEnd: pageStart,
      });
    }
  } else {
    let blockStart = 0;
    const flushBlock = (blockEnd: number) => {
      while (blockStart < blockEnd && !(lines[blockStart] ?? '').trim()) blockStart += 1;
      let blockEndTrimmed = blockEnd;
      while (blockEndTrimmed > blockStart && !(lines[blockEndTrimmed - 1] ?? '').trim()) {
        blockEndTrimmed -= 1;
      }
      if (blockStart >= blockEndTrimmed) return;
      const firstLine = (lines[blockStart] ?? '').trim();
      finalizeSection(
        sections,
        blockStart + 1,
        blockEndTrimmed,
        firstLine.slice(0, 80) || undefined,
        undefined,
        lines,
      );
    };
    for (let index = 0; index < lines.length; index += 1) {
      if (!(lines[index] ?? '').trim() && index > blockStart) {
        flushBlock(index);
        blockStart = index + 1;
      }
    }
    flushBlock(lines.length);
  }

  if (sections.length === 0) {
    sections.push({
      sectionId: assignSectionId(1, 0),
      startLine: 1,
      endLine: lines.length,
      pageStart: pageAtLine(lines, 0),
      pageEnd: pageAtLine(lines, lines.length - 1),
    });
  }

  return { version: 'c1-read-v1', sections };
}

export function parseSectionIndexFromOverview(
  overview: unknown,
): FileSectionIndexEntry[] | undefined {
  if (!overview || typeof overview !== 'object') return undefined;
  const sections = (overview as { sections?: unknown }).sections;
  if (!Array.isArray(sections)) return undefined;
  const parsed: FileSectionIndexEntry[] = [];
  for (const item of sections) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    if (typeof row.sectionId !== 'string' || typeof row.startLine !== 'number') continue;
    parsed.push({
      sectionId: row.sectionId,
      ...(typeof row.title === 'string' ? { title: row.title } : {}),
      ...(typeof row.level === 'number' ? { level: row.level } : {}),
      startLine: row.startLine,
      endLine: typeof row.endLine === 'number' ? row.endLine : row.startLine,
      ...(typeof row.pageStart === 'number' ? { pageStart: row.pageStart } : {}),
      ...(typeof row.pageEnd === 'number' ? { pageEnd: row.pageEnd } : {}),
    });
  }
  return parsed.length ? parsed : undefined;
}
