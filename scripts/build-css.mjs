// Concatenates the theme sources into the published stylesheets.
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const CSS_BUNDLES = {
  'style.css': ['src/themes/tokens.css', 'src/themes/editor.css', 'src/themes/content.css'],
  'content.css': ['src/themes/tokens.css', 'src/themes/content.css'],
};

await mkdir('dist', { recursive: true });
for (const [output, sources] of Object.entries(CSS_BUNDLES)) {
  const parts = await Promise.all(sources.map((file) => readFile(file, 'utf8')));
  await writeFile(`dist/${output}`, parts.join('\n'));
  console.log(`css: dist/${output} ← ${sources.join(', ')}`);
}
