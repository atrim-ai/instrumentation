/**
 * Global teardown for integration tests
 * Stops the OTEL collector after all tests complete
 */

import { stopCollector } from './helpers.js'

async function globalTeardown() {
  console.log('\n🧹 Tearing down integration tests...\n')

  try {
    await stopCollector()
    console.log('\n✅ Teardown complete\n')
  } catch (error) {
    console.error('\n⚠️  Teardown had errors:', error)
  }
}

export default globalTeardown
