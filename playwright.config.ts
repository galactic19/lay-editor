import { defineConfig, devices } from '@playwright/test';

const PORT = 5173;
const projects = [
  { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } },
  { name: 'mobile-chromium', use: { ...devices['Pixel 7'] } },
];
if (process.env.E2E_WEBKIT) projects.push({ name: 'mobile-webkit', use: { ...devices['iPhone 14'] } });

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  reporter: [['list']],
  use: { baseURL: `http://localhost:${PORT}/demo/` },
  projects,
  webServer: {
    command: `npm run dev -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/demo/`,
    reuseExistingServer: !process.env.CI,
  },
});
