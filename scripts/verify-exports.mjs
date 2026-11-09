// Fails when a path in package.json exports is missing, or the core cannot be imported (ESM) or
// required (CommonJS, through the UMD file) without a DOM.
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const targets = (value) => (typeof value === 'string' ? [value] : Object.values(value).flatMap(targets));
const paths = [...targets(pkg.exports), pkg.module, pkg.types, pkg.unpkg, pkg.jsdelivr].filter(Boolean);
const missing = paths.filter((path) => !existsSync(path));
if (missing.length) {
  console.error(`exports: missing ${missing.join(', ')}`);
  process.exit(1);
}
const entries = {
  import: await import(pathToFileURL(pkg.exports['.'].import).href),
  require: pkg.exports['.'].require && createRequire(import.meta.url)(resolve(pkg.exports['.'].require)),
};
for (const [condition, core] of Object.entries(entries)) {
  if (typeof core?.createEditor !== 'function' || typeof core?.sanitizeHTML !== 'function') {
    console.error(`exports: the core "${condition}" entry does not export createEditor and sanitizeHTML`);
    process.exit(1);
  }
}
console.log(`exports: ${paths.length} paths ok, core imports and requires without a DOM`);
