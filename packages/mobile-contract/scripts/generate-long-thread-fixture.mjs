import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const conversation = [];
for (let i = 1; i <= 24; i++) {
  conversation.push({ kind: 'user', id: `u-${i}`, content: `压测 turn ${i}：请用一句话确认收到。` });
  conversation.push({
    kind: 'assistant',
    id: `a-${i}`,
    deliveryStatus: 'completed',
    blocks: [{ type: 'text', content: `已收到 turn ${i}，继续滚动以验证列表性能。` }],
  });
}

const payload = {
  schemaVersion: 1,
  scenarioId: 'long-thread-scroll',
  title: '长会话压测',
  conversation,
  composer: { composerTextMode: 'new-run' },
  chrome: { connectionState: 'live', serviceState: 'ready' },
};

writeFileSync(
  join(root, 'fixtures/preview/long-thread-scroll.json'),
  `${JSON.stringify(payload, null, 2)}\n`,
);
console.log(`Wrote long-thread-scroll.json with ${conversation.length} items.`);
