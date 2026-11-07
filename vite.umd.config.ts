import { defineConfig } from 'vite';

const NAME = 'LayEditor';
/**
 * One bundle in two files: editor.umd.js for <script> tags and CDNs, editor.umd.cjs for require() (the package is
 * "type": "module", so Node reads any .js file in it as ESM and would skip the UMD wrapper's CommonJS branch).
 */
const FILES = ['editor.umd.js', 'editor.umd.cjs'];

/** Single-file build. UMD cannot split chunks, so lowlight is bundled in. */
export default defineConfig({
  build: {
    target: ['es2022', 'safari16'],
    emptyOutDir: false,
    lib: { entry: 'src/index.ts', name: NAME },
    rollupOptions: { output: FILES.map((entryFileNames) => ({ format: 'umd' as const, name: NAME, entryFileNames })) },
  },
});
