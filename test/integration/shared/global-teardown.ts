/**
 * Global teardown for integration tests
 *
 * NOTE: Each test suite now manages its own isolated OTEL collector container
 * using testcontainers, so no global teardown is needed.
 */

async function globalTeardown() {
  console.log('\n🧹 Tearing down integration tests...\n')
  console.log('✅ Isolated collector containers stopped by individual test suites\n')
}

export default globalTeardown
