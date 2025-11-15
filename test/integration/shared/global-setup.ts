/**
 * Global setup for integration tests
 *
 * NOTE: Each test suite now starts its own isolated OTEL collector container
 * using testcontainers, so no global setup is needed.
 */

async function globalSetup() {
  console.log('\n🧪 Setting up integration tests...\n')
  console.log('✅ Using isolated collector containers per test suite\n')

  // Helper to check if error is a harmless connection refused during shutdown
  const isHarmlessConnectionError = (error: any): boolean => {
    // Check for direct error properties
    if (
      error &&
      typeof error === 'object' &&
      error.code === 'ECONNREFUSED' &&
      (error.address === '127.0.0.1' || error.address === '::1') &&
      error.port === 4318
    ) {
      return true
    }

    // Check for AggregateError with nested connection errors
    if (error && error.errors && Array.isArray(error.errors)) {
      return error.errors.every(
        (e: any) =>
          e &&
          e.code === 'ECONNREFUSED' &&
          (e.address === '127.0.0.1' || e.address === '::1') &&
          e.port === 4318
      )
    }

    return false
  }

  // Suppress harmless ECONNREFUSED errors during test cleanup
  // These occur when BatchSpanProcessor tries to flush spans after
  // the collector has been stopped - they're expected and harmless
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
}

export default globalSetup
