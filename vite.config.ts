import { defineConfig } from 'vitest/config';

export default defineConfig({
  build: {
    target: ['es2022', 'safari16'],
    lib: { entry: { index: 'src/index.ts' }, formats: ['es'] },
    rollupOptions: { external: ['react', 'react-dom', 'vue'] },
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
