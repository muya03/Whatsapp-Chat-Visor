import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures');
export const fixture = (name: string): string => readFileSync(join(dir, name), 'utf8');
