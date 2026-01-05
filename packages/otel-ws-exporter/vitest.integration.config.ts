import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    testTimeout: 30000,
    hookTimeout: 60000,
    globals: true,
    environment: 'node', // Use Node.js for integration tests (ws library)
    include: ['test/integration/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/target/**', '**/test/unit/**'],
    watch: false,
    reporters: ['verbose']
  }
})
