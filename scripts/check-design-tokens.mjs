#!/usr/bin/env node
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '../apps/web/src');
const badWeight = /font-weight:\s*(520|550|650|680)\b/g;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const stat = statSync(path);
    if (stat.isDirectory()) walk(path, out);
    else if (name.endsWith('.css')) out.push(path);
  }
  return out;
}

let failed = false;
for (const file of walk(root)) {
  const text = readFileSync(file, 'utf8');
  const matches = [...text.matchAll(badWeight)];
  for (const match of matches) {
    failed = true;
    console.error(`${file}: disallowed font-weight ${match[0]}`);
  }
}

if (failed) process.exit(1);
console.log('check-design-tokens: ok');
