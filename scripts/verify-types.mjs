// Fails when the published types do not resolve, or silently turn into `any`, for a consumer
// using node10, node16, nodenext or bundler module resolution, stylesheet imports included
// (TypeScript 6 checks side-effect imports). The consumer imports the build like it would an
// installed copy of the package: the consumer is a virtual file next to the package, whose
// node_modules/@laymaker/editor maps onto this directory (node10 has no self-reference by name).
import { readFileSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import ts from 'typescript';

const PACKAGE = JSON.parse(readFileSync('package.json', 'utf8')).name;
const CONSUMER = resolve('__verify-types__', 'consumer.ts');
const INSTALLED = resolve('__verify-types__', 'node_modules', PACKAGE);
/** A path inside the virtual install, as the real path in this directory. */
const real = (path) => (path === INSTALLED || path.startsWith(INSTALLED + sep) ? resolve(path.slice(INSTALLED.length + 1)) : path);
const SOURCE = `
import { createEditor, type Editor } from '@laymaker/editor';
import { LayEditor as ReactEditor, type LayEditorProps } from '@laymaker/editor/react';
import { LayEditor as VueEditor } from '@laymaker/editor/vue';
import '@laymaker/editor/style.css';
import '@laymaker/editor/content.css';

const editor: Editor = createEditor({ element: '#editor' });
// @ts-expect-error getHTML() returns a string
export const html: number = editor.getHTML();
// @ts-expect-error element is required
createEditor({});
// @ts-expect-error value is a string
export const props: LayEditorProps = { value: 1 };
// @ts-expect-error a component, not a number
export const react: number = ReactEditor;
declare const vue: InstanceType<typeof VueEditor>;
export const fromVue: Editor | null = vue.getEditor();
// @ts-expect-error getEditor() returns the editor
export const wrongVue: number = vue.getEditor();
`;

const RESOLUTIONS = {
  // Older projects ("moduleResolution": "node") ignore `exports`; TypeScript 6 deprecates the mode.
  node10: { module: ts.ModuleKind.CommonJS, moduleResolution: ts.ModuleResolutionKind.Node10, ignoreDeprecations: '6.0' },
  node16: { module: ts.ModuleKind.Node16, moduleResolution: ts.ModuleResolutionKind.Node16 },
  nodenext: { module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext },
  bundler: { module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler },
};

function check(settings) {
  const options = { ...settings, target: ts.ScriptTarget.ES2022, lib: ['lib.es2022.d.ts', 'lib.dom.d.ts'], types: [], strict: true, noEmit: true, skipLibCheck: false };
  const host = ts.createCompilerHost(options);
  const { fileExists, readFile, directoryExists } = host;
  host.fileExists = (file) => file === CONSUMER || fileExists(real(file));
  host.readFile = (file) => (file === CONSUMER ? SOURCE : readFile(real(file)));
  // The consumer's directory and the virtual node_modules/@laymaker leading to the install exist too.
  host.directoryExists = (dir) => INSTALLED.startsWith(dir + sep) || (directoryExists?.(real(dir)) ?? true);
  host.realpath = (path) => path;
  const program = ts.createProgram([CONSUMER], options, host);
  return ts.getPreEmitDiagnostics(program).filter((d) => d.category === ts.DiagnosticCategory.Error);
}

let failed = false;
for (const [name, settings] of Object.entries(RESOLUTIONS)) {
  const errors = check(settings);
  if (!errors.length) continue;
  failed = true;
  console.error(`types (${name}):\n${ts.formatDiagnostics(errors, { getCanonicalFileName: (f) => f, getCurrentDirectory: () => process.cwd(), getNewLine: () => '\n' })}`);
}
if (failed) process.exit(1);
console.log(`types: resolve and type-check under ${Object.keys(RESOLUTIONS).join(', ')}`);
