import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';

const sourceArgument = process.argv.slice(2).find((argument) => argument !== '--');
if (!sourceArgument)
  throw new Error('用法：pnpm setup:tokenizer -- /absolute/path/to/deepseek_v3_tokenizer');
if (!isAbsolute(sourceArgument)) throw new Error('Tokenizer source 必须是绝对路径。');

const workspace = resolve(import.meta.dirname, '..');
const target = join(workspace, 'artifacts/tokenizers/deepseek-v3');
const files = {
  'tokenizer.json': 'ecb6f9fc369894346f0511f4074ca75cee5cd5f3b06d02f1ba35fcd39f8e121d',
  'tokenizer_config.json': '144a6d92b6012baeb4f2ac41d48ed3458e758f977a0fb5caf75ff07698fc844c',
};
await mkdir(target, { recursive: true });
for (const [name, expected] of Object.entries(files)) {
  const source = join(sourceArgument, name);
  const body = await readFile(source);
  const actual = createHash('sha256').update(body).digest('hex');
  if (actual !== expected) throw new Error(`${name} SHA-256 不匹配：${actual}`);
  await copyFile(source, join(target, name));
}
console.log(`DeepSeek Tokenizer 已校验并安装到 ${target}`);
