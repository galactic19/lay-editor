// Fails when the published types do not resolve, or silently turn into `any`, for a consumer
// using node16, nodenext or bundler module resolution. The consumer is a virtual file inside
// the package, so it imports the build through the package's own name like an installed copy.
import { resolve } from 'node:path';
import ts from 'typescript';

const CONSUMER = resolve('__verify-types__.ts');
const SOURCE = `
import { createEditor, type Editor } from '@laymaker/editor';
import { LayEditor as ReactEditor, type LayEditorProps } from '@laymaker/editor/react';
import { LayEditor as VueEditor } from '@laymaker/editor/vue';

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
  node16: { module: ts.ModuleKind.Node16, moduleResolution: ts.ModuleResolutionKind.Node16 },
  nodenext: { module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext },
  bundler: { module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler },
};

function check(settings) {
  const options = { ...settings, target: ts.ScriptTarget.ES2022, lib: ['lib.es2022.d.ts', 'lib.dom.d.ts'], types: [], strict: true, noEmit: true, skipLibCheck: false };
  const host = ts.createCompilerHost(options);
  const { fileExists, readFile } = host;
  host.fileExists = (file) => file === CONSUMER || fileExists(file);
  host.readFile = (file) => (file === CONSUMER ? SOURCE : readFile(file));
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
