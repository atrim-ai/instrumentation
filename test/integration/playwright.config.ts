import { defineConfig, devices } from '@playwright/test'

/**
 * Integration test configuration for @atrim/instrumentation
 * Tests each example to ensure traces are sent to OTEL collector
 */
export default defineConfig({
  testDir: './tests',

  // Test timeout
  timeout: 60000,

  // Expect timeout for assertions
  expect: {
    timeout: 10000
  },

  // Run tests in parallel
  fullyParallel: false, // Run serially to avoid port conflicts

  // Fail the build on CI if you accidentally left test.only
  forbidOnly: !!process.env.CI,

  // Retry on CI only
  retries: process.env.CI ? 2 : 0,

  // Global setup/teardown
  globalSetup: './tests/global-setup.ts',
  globalTeardown: './tests/global-teardown.ts',

  // Reporter
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['json', { outputFile: 'test-results.json' }]
  ],

  // Shared settings
  use: {
    // Base URL for tests
    baseURL: 'http://localhost',

    // Collect trace on failure
    trace: 'on-first-retry',

    // Screenshot on failure
    screenshot: 'only-on-failure',

    // Video on failure
    video: 'retain-on-failure'
  },

  // Projects for different examples
  projects: [
    {
      name: 'express-example',
      use: { ...devices['Desktop Chrome'] },
      testMatch: '**/express.spec.ts'
    },
    {
      name: 'vanilla-example',
      use: { ...devices['Desktop Chrome'] },
      testMatch: '**/vanilla.spec.ts'
    },
    {
      name: 'effect-ts-example',
      use: { ...devices['Desktop Chrome'] },
      testMatch: '**/effect-ts.spec.ts'
    },
    {
      name: 'effect-platform-example',
      use: { ...devices['Desktop Chrome'] },
      testMatch: '**/effect-platform.spec.ts'
    },
    {
      name: 'detection-tests',
      use: { ...devices['Desktop Chrome'] },
      testMatch: '**/detection.spec.ts'
    }
  ],

  // Web server configuration for starting examples
  webServer: undefined // We'll start servers manually in global setup
})
