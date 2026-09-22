import { sandboxLimits } from './sandbox-config';

const LEGACY_TRUNCATION_MARK = '\n[truncated]\n';

/** C3-A head+tail；调试与 fake Provider 仍可使用。 */
export function boundStream(input: string, maxBytes = sandboxLimits.streamMaxBytes): {
  text: string;
  truncated: boolean;
} {
  const bytes = Buffer.from(input, 'utf8');
  if (bytes.length <= maxBytes) return { text: input, truncated: false };
  const head = bytes.subarray(0, sandboxLimits.streamHeadBytes).toString('utf8');
  const tail = bytes.subarray(bytes.length - sandboxLimits.streamTailBytes).toString('utf8');
  return { text: `${head}${LEGACY_TRUNCATION_MARK}${tail}`, truncated: true };
}

/** C3-B：模型可见 stdout/stderr 采用 tail 优先截断。 */
export function boundStreamTail(input: string, maxBytes = sandboxLimits.streamMaxBytes): {
  text: string;
  truncated: boolean;
  full: string;
} {
  const bytes = Buffer.from(input, 'utf8');
  if (bytes.length <= maxBytes) return { text: input, truncated: false, full: input };
  const tail = bytes.subarray(bytes.length - maxBytes).toString('utf8');
  return {
    text: `[output truncated]\n${tail}`,
    truncated: true,
    full: input,
  };
}
