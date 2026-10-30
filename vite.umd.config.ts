import { defineConfig } from 'vite';

/** Single-file build for <script> tags. UMD cannot split chunks, so lowlight is bundled in. */
export default defineConfig({
  build: {
    target: ['es2022', 'safari16'],
    emptyOutDir: false,
    lib: { entry: 'src/index.ts', name: 'LayEditor', formats: ['umd'], fileName: () => 'editor.umd.js' },
  },
});
