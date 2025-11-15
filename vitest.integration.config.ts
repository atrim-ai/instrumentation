import { defineConfig } from 'vitest/config'

/**
 * Integration test configuration for @atrim/instrumentation
 * Tests each example to ensure traces are sent to OTEL collector
 */
export default defineConfig({
  test: {
    // Increased timeouts for integration tests with Docker containers
    testTimeout: 60000, // 60 seconds for individual tests
    hookTimeout: 90000, // 90 seconds for setup/teardown (Docker containers can be slow)

    // Enable parallel execution with thread pool
    pool: 'threads',
    poolOptions: {
      threads: {
        minThreads: 2,
        maxThreads: 8, // Allow multiple threads for concurrent testing
      },
    },

    // Global setup file
    globalSetup: './test/integration/shared/global-setup.ts',

    // Include integration test files
    include: [
      '**/*.integration.test.{js,ts}',
      '**/test/integration/**/*.test.{js,ts}'
    ],

    // Exclude unit tests and other files
    exclude: [
      '**/node_modules/**',
      '**/target/**',
      '**/test/unit/**',
    ],

    watch: false, // Disable watch mode by default - run once and exit

    // Environment setup
    environment: 'node',
    globals: true,

    // Reporters
    reporters: ['verbose'],
  },
})
