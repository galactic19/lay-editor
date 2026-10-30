// Fails when a path in package.json exports is missing, or the core cannot be imported without a DOM.
import { existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const targets = (value) => (typeof value === 'string' ? [value] : Object.values(value).flatMap(targets));
const paths = [...targets(pkg.exports), pkg.module, pkg.types, pkg.unpkg, pkg.jsdelivr].filter(Boolean);
const missing = paths.filter((path) => !existsSync(path));
if (missing.length) {
  console.error(`exports: missing ${missing.join(', ')}`);
  process.exit(1);
}
const core = await import(pathToFileURL(pkg.exports['.'].import).href);
if (typeof core.createEditor !== 'function' || typeof core.sanitizeHTML !== 'function') {
  console.error('exports: core entry does not export createEditor and sanitizeHTML');
  process.exit(1);
}
console.log(`exports: ${paths.length} paths ok, core imports without a DOM`);
