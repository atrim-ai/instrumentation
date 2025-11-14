/**
 * Global setup for integration tests
 *
 * NOTE: Each test suite now starts its own isolated OTEL collector container
 * using testcontainers, so no global setup is needed.
 */

async function globalSetup() {
  console.log('\n🧪 Setting up integration tests...\n')
  console.log('✅ Using isolated collector containers per test suite\n')
}

export default globalSetup
