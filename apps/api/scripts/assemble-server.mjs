import { readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const sourceDir = join(here, '..', 'src', 'server.parts');
const output = join(here, '..', 'src', 'server.generated.ts');
const files = (await readdir(sourceDir)).filter((name) => name.endsWith('.tsfrag')).sort();
if (!files.length) throw new Error('No server source fragments found');
const source = (await Promise.all(files.map((name) => readFile(join(sourceDir, name), 'utf8')))).join('');
await writeFile(output, source);
