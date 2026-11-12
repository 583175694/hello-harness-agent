import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { styleSpecSchema } from '../types.js';
import { z } from 'zod';

const dataDir = join(dirname(fileURLToPath(import.meta.url)));

function readJsonFile(name: string): unknown {
  return JSON.parse(readFileSync(join(dataDir, name), 'utf8'));
}

export const defaultStyleSpec = styleSpecSchema.parse(readJsonFile('style-spec.json'));

const layoutsSchema = z.array(
  z.object({
    id: z.string(),
    canvas: z.object({ width: z.literal(1280), height: z.literal(720) }),
    slots: z.array(z.unknown()),
  }),
);

export const layoutCatalog = layoutsSchema.parse(readJsonFile('layouts.json'));
