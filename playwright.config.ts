import { defineConfig, devices } from '@playwright/test';

const STUB = 'http://127.0.0.1:4180';
// APP_FIXED_DATE pins the app's idea of today (a Wednesday) so the current week and past days are predictable.
const stubEnv = {
  NUTRITION_BASE_URL: STUB,
  PRICE_BASE_URL: STUB,
  APP_FIXED_DATE: '2026-10-14',
  // Epic 3: the online recipe search talks to the stub, never to google.com or allrecipes.com
  SEARCH_GOOGLE_BASE_URL: `${STUB}/google`,
  SEARCH_ALLRECIPES_BASE_URL: `${STUB}/allrecipes`,
};

export default defineConfig({
  testDir: 'e2e',
  testMatch: '*.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  reporter: [['list']],
  globalSetup: './e2e/global-setup.ts',
  use: { baseURL: 'http://127.0.0.1:4173', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  // Two app instances with fresh temp databases; neither contacts a real website (stub server on :4180).
  webServer: [
    {
      command: 'npm run start:e2e',
      url: 'http://127.0.0.1:4173/api/meals',
      env: { PORT: '4173', CONTROL_PORT: '4175', ...stubEnv },
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      // short import deadline for the "30 s deadline" journey (J3c)
      command: 'npm run start:e2e',
      url: 'http://127.0.0.1:4174/api/meals',
      env: { PORT: '4174', CONTROL_PORT: '4176', IMPORT_DEADLINE_MS: '2000', ONLINE_SEARCH_DEADLINE_MS: '2000', ...stubEnv },
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});


