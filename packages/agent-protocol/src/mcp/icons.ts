import { z } from 'zod';

export const mcpIconSchema = z.object({
  src: z.string().min(1),
  mimeType: z.string().min(1).optional(),
  sizes: z.array(z.string().min(1)).optional(),
  theme: z.enum(['light', 'dark']).optional(),
});

export type McpIcon = z.infer<typeof mcpIconSchema>;

export function isAllowedMcpIconSrc(src: string): boolean {
  const trimmed = src.trim();
  if (/^https:\/\/.+/i.test(trimmed)) return true;
  return /^data:image\/(png|jpeg|jpg);base64,[a-z0-9+/=]+$/i.test(trimmed);
}

export function parseMcpIcons(value: unknown): McpIcon[] {
  if (!Array.isArray(value)) return [];
  const parsed: McpIcon[] = [];
  for (const item of value) {
    const result = mcpIconSchema.safeParse(item);
    if (result.success) parsed.push(result.data);
  }
  return parsed;
}

function mimeRank(mimeType?: string): number {
  const mime = (mimeType ?? '').toLowerCase();
  if (mime === 'image/png') return 0;
  if (mime === 'image/jpeg' || mime === 'image/jpg') return 1;
  if (mime === 'image/webp') return 2;
  if (mime === 'image/svg+xml') return 9;
  return 5;
}

function sizeRank(sizes: string[] | undefined, targetPx: number): number {
  if (!sizes?.length) return 3;
  if (sizes.includes('any')) return 1;
  let best = 99;
  for (const spec of sizes) {
    const match = /^(\d+)x(\d+)$/.exec(spec);
    if (!match) continue;
    const px = Math.max(Number(match[1]), Number(match[2]));
    best = Math.min(best, Math.abs(px - targetPx));
  }
  return best;
}

/** 从 MCP icons 数组选出一条可展示的 src；无合法项时返回 undefined。 */
export function pickMcpIconSrc(
  icons: readonly McpIcon[] | undefined,
  options?: { theme?: 'light' | 'dark'; sizePx?: number },
): string | undefined {
  if (!icons?.length) return undefined;
  const theme = options?.theme ?? 'light';
  const sizePx = options?.sizePx ?? 24;
  const themed = icons.filter((icon) => !icon.theme || icon.theme === theme);
  const pool = themed.length ? themed : [...icons];
  pool.sort((a, b) => {
    const mimeDiff = mimeRank(a.mimeType) - mimeRank(b.mimeType);
    if (mimeDiff !== 0) return mimeDiff;
    return sizeRank(a.sizes, sizePx) - sizeRank(b.sizes, sizePx);
  });
  for (const icon of pool) {
    if (isAllowedMcpIconSrc(icon.src)) return icon.src.trim();
  }
  return undefined;
}

export function resolveMcpToolIconSrc(
  entry: { icons?: readonly McpIcon[] } | undefined,
  serverIcons: readonly McpIcon[] | undefined,
  options?: { theme?: 'light' | 'dark'; sizePx?: number },
): string | undefined {
  return (
    pickMcpIconSrc(entry?.icons, options) ?? pickMcpIconSrc(serverIcons, options) ?? undefined
  );
}

/** Wire 未返回 icons 时，按 server 名的内置兜底（与 Cursor Marketplace 思路类似）。 */
const MCP_SERVER_ICON_FALLBACK_SRC: Readonly<Record<string, string>> = {
  tinyfish: 'https://agent.tinyfish.ai/favicon.ico',
};

export function mcpServerIconFallbackSrc(serverName: string): string | undefined {
  const src = MCP_SERVER_ICON_FALLBACK_SRC[serverName.trim().toLowerCase()];
  if (!src || !isAllowedMcpIconSrc(src)) return undefined;
  return src;
}
