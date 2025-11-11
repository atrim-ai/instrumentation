/**
 * Global setup for integration tests
 * Starts the OTEL collector before running any tests
 */

import { startCollector } from './helpers.js'

async function globalSetup() {
  console.log('\n🧪 Setting up integration tests...\n')

  try {
    await startCollector()
    console.log('\n✅ Setup complete\n')
  } catch (error) {
    console.error('\n❌ Setup failed:', error)
    throw error
  }
}

export default globalSetup
