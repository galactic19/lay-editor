// Concatenates the theme sources into the published stylesheets, plus the empty declaration file
// their `types` condition points at (TypeScript 6 checks side-effect imports such as `import '…/style.css'`).
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const CSS_BUNDLES = {
  'style.css': ['src/themes/tokens.css', 'src/themes/editor.css', 'src/themes/content.css'],
  'content.css': ['src/themes/tokens.css', 'src/themes/content.css'],
};
const CSS_TYPES = { file: 'css.d.ts', source: '// Stylesheets have no exports; this lets TypeScript resolve the import.\nexport {};\n' };

await mkdir('dist', { recursive: true });
for (const [output, sources] of Object.entries(CSS_BUNDLES)) {
  const parts = await Promise.all(sources.map((file) => readFile(file, 'utf8')));
  await writeFile(`dist/${output}`, parts.join('\n'));
  console.log(`css: dist/${output} ← ${sources.join(', ')}`);
}
await writeFile(`dist/${CSS_TYPES.file}`, CSS_TYPES.source);
console.log(`css: dist/${CSS_TYPES.file} (types for the stylesheet imports)`);
