// The package is ESM, so node16/nodenext consumers read the declarations with Node's rules,
// which need explicit extensions. The source keeps bundler-style imports; the emitted relative
// specifiers are completed here: './core/Editor' → './core/Editor.js', '../..' → '../../index.js'.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const DTS = '.d.ts';
const RELATIVE = /((?:from|import)\s*\(?\s*)(['"])(\.\.?(?:\/[^'"]*)?)\2/g;
const typesDir = dirname(JSON.parse(readFileSync('package.json', 'utf8')).types);

function complete(file, spec) {
  const target = resolve(dirname(file), spec);
  if (existsSync(target + DTS)) return `${spec}.js`;
  if (existsSync(join(target, `index${DTS}`))) return `${spec}/index.js`;
  return spec;
}

const files = readdirSync(typesDir, { recursive: true })
  .filter((name) => name.endsWith(DTS))
  .map((name) => join(typesDir, name));
for (const file of files) {
  const code = readFileSync(file, 'utf8');
  const next = code.replace(RELATIVE, (_match, head, quote, spec) => `${head}${quote}${complete(file, spec)}${quote}`);
  if (next !== code) writeFileSync(file, next);
}
console.log(`types: completed relative imports in ${files.length} declaration files`);
