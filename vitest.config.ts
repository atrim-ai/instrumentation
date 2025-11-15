import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/unit/**/*.test.ts'], // Only run unit tests with vitest
    exclude: [
      'test/integration/**',
      '**/*.integration.test.ts'
    ], // Integration tests use vitest.integration.config.ts
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      reportsDirectory: 'target/coverage',
      exclude: ['**/node_modules/**', '**/target/**', '**/test/integration/**', '**/examples/**']
    }
  }
})
