/**
 * Global setup for integration tests
 *
 * NOTE: Each test suite now starts its own isolated OTEL collector container
 * using testcontainers, so no global setup is needed.
 */

import { suppressEconnrefused } from './helpers.js'

// Install error suppressors IMMEDIATELY, before any tests run
suppressEconnrefused()

async function globalSetup() {
  console.log('\n🧪 Setting up integration tests...\n')
  console.log('✅ Using isolated collector containers per test suite\n')
  console.log('✅ Error suppression installed for ECONNREFUSED during shutdown\n')
}

export default globalSetup
