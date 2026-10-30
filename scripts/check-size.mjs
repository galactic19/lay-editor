// Gzip size of the core entry plus every chunk it imports statically (lazy chunks such as lowlight excluded).
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { gzipSync } from 'node:zlib';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const budget = pkg.laymaker.sizeBudget;
const STATIC_IMPORT = /(?:import|export)\s*(?:[\w$*{},\s]*?\s*from\s*)?["'](\.\/[^"']+\.js)["']/g;

function collect(file, seen = new Set()) {
  if (seen.has(file)) return seen;
  seen.add(file);
  const code = readFileSync(file, 'utf8');
  for (const [, spec] of code.matchAll(STATIC_IMPORT)) collect(join(dirname(file), spec), seen);
  return seen;
}

const files = [...collect(pkg.exports['.'].import)];
const total = files.reduce((sum, file) => sum + gzipSync(readFileSync(file)).length, 0);
console.log(`core gzip: ${total} / ${budget} bytes (${files.join(', ')})`);
if (total > budget) {
  console.error('size: over budget');
  process.exit(1);
}
