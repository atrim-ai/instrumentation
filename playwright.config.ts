import { defineConfig, devices } from '@playwright/test'

/**
 * Integration test configuration for @atrim/instrumentation
 * Tests each example to ensure traces are sent to OTEL collector
 */
export default defineConfig({
  testDir: './test/integration',

  // Test timeout (increased for CI to account for resource constraints)
  timeout: process.env.CI ? 120000 : 60000,

  // Expect timeout for assertions
  expect: {
    timeout: process.env.CI ? 20000 : 10000
  },

  // Run tests in parallel (each suite uses isolated collector containers)
  fullyParallel: true,

  // Limit workers on CI to prevent resource exhaustion
  workers: process.env.CI ? 1 : undefined,

  // Fail the build on CI if you accidentally left test.only
  forbidOnly: !!process.env.CI,

  // Retry on CI only
  retries: process.env.CI ? 2 : 0,

  // Global setup/teardown
  globalSetup: './test/integration/shared/global-setup.ts',
  globalTeardown: './test/integration/shared/global-teardown.ts',

  // Reporter
  reporter: [
    ['list'],
    ['html', { outputFolder: 'target/playwright-report', open: 'never' }],
    ['json', { outputFile: 'target/test-results.json' }]
  ],

  // Output directories
  outputDir: 'target/test-results',

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

  // Projects for different functional areas
  projects: [
    {
      name: 'express',
      use: { ...devices['Desktop Chrome'] },
      testMatch: 'express/**/*.spec.ts'
    },
    {
      name: 'vanilla',
      use: { ...devices['Desktop Chrome'] },
      testMatch: 'vanilla/**/*.spec.ts'
    },
    {
      name: 'effect-express',
      use: { ...devices['Desktop Chrome'] },
      testMatch: 'effect/effect-express/**/*.spec.ts'
    },
    {
      name: 'effect-platform',
      use: { ...devices['Desktop Chrome'] },
      testMatch: 'effect/effect-platform/**/*.spec.ts'
    },
    {
      name: 'effect-fiberset',
      use: { ...devices['Desktop Chrome'] },
      testMatch: 'effect/fiberset/**/*.spec.ts'
    },
    {
      name: 'bun',
      use: { ...devices['Desktop Chrome'] },
      testMatch: 'bun/**/*.spec.ts'
    },
    {
      name: 'detection',
      use: { ...devices['Desktop Chrome'] },
      testMatch: 'core/detection/**/*.spec.ts'
    }
  ],

  // Web server configuration for starting examples
  webServer: undefined // We'll start servers manually in global setup
})
