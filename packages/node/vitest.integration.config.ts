import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Increased timeouts for Docker container startup and server spawning
    testTimeout: 120000, // 2 minutes for individual tests
    hookTimeout: 60000,  // 1 minute for setup/teardown (Docker containers)

    // Enable parallel execution with thread pool
    pool: 'threads',
    poolOptions: {
      threads: {
        minThreads: 2,
        maxThreads: 8, // Allow multiple threads for concurrent testing
      },
    },

    // Include integration test files
    include: [
      'test/integration/**/*.spec.ts',
      'test/integration/**/*.integration.test.ts'
    ],

    // Exclude node_modules and dist
    exclude: [
      '**/node_modules/**',
      '**/target/**',
    ],

    // Disable watch mode by default - run once and exit
    watch: false,

    // Environment setup
    environment: 'node',

    // Reporters
    reporters: ['verbose'],

    // Globals
    globals: true,
  },
})
