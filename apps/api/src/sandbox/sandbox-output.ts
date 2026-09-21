import { sandboxLimits } from './sandbox-config';

const TRUNCATION_MARK = '\n[truncated]\n';

export function boundStream(input: string, maxBytes = sandboxLimits.streamMaxBytes): {
  text: string;
  truncated: boolean;
} {
  const bytes = Buffer.from(input, 'utf8');
  if (bytes.length <= maxBytes) return { text: input, truncated: false };
  const head = bytes.subarray(0, sandboxLimits.streamHeadBytes).toString('utf8');
  const tail = bytes.subarray(bytes.length - sandboxLimits.streamTailBytes).toString('utf8');
  return { text: `${head}${TRUNCATION_MARK}${tail}`, truncated: true };
}
