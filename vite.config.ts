import { defineConfig } from 'vitest/config';
import { demoUploadPlugin } from './demo/upload-plugin.ts';

export default defineConfig({
  plugins: [demoUploadPlugin()],
  build: {
    target: ['es2022', 'safari16'],
    lib: {
      entry: { index: 'src/index.ts', react: 'src/adapters/react.ts', vue: 'src/adapters/vue.ts' },
      formats: ['es'],
    },
    rollupOptions: { external: ['react', 'react-dom', 'react/jsx-runtime', 'vue'] },
  },
  test: {
    globals: true,
    pool: 'forks',
    isolate: true,
    environment: 'jsdom',
    setupFiles: ['tests/setup.ts'],
    include: ['tests/unit/**/*.test.ts'],
  },
});
