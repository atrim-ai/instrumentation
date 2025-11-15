/**
 * Global setup for integration tests
 *
 * NOTE: Each test suite now starts its own isolated OTEL collector container
 * using testcontainers, so no global setup is needed.
 */

// Install error suppressors IMMEDIATELY, before any tests run
// Helper to check if error is a harmless connection refused during shutdown
const isHarmlessConnectionError = (error: any): boolean => {
  // Check for direct ECONNREFUSED error
  if (error && typeof error === 'object' && error.code === 'ECONNREFUSED') {
    return true
  }

  // Check for AggregateError with all ECONNREFUSED errors
  if (error && error.errors && Array.isArray(error.errors)) {
    return error.errors.every((e: any) => e && e.code === 'ECONNREFUSED')
  }

  // Check for serialized error format from Vitest
  if (typeof error === 'string' && error.includes('ECONNREFUSED')) {
    return true
  }

  return false
}

// Install handlers immediately (not in async function)
process.on('unhandledRejection', (reason: any) => {
  if (isHarmlessConnectionError(reason)) {
    // Silently ignore - this is expected during test teardown
    return
  }

  // For all other unhandled rejections, log them
  console.error('Unhandled Rejection:', reason)
})

process.on('uncaughtException', (error: any) => {
  if (isHarmlessConnectionError(error)) {
    // Silently ignore - this is expected during test teardown
    return
  }

  // For all other uncaught exceptions, log and exit (can't recover from uncaught exception)
  console.error('Uncaught Exception:', error)
  process.exit(1)
})

async function globalSetup() {
  console.log('\n🧪 Setting up integration tests...\n')
  console.log('✅ Using isolated collector containers per test suite\n')
  console.log('✅ Error suppression installed for ECONNREFUSED during shutdown\n')
}

export default globalSetup
