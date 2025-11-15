/**
 * Global setup for integration tests
 *
 * NOTE: Each test suite now starts its own isolated OTEL collector container
 * using testcontainers, so no global setup is needed.
 */

async function globalSetup() {
  console.log('\n🧪 Setting up integration tests...\n')
  console.log('✅ Using isolated collector containers per test suite\n')

  // Suppress harmless ECONNREFUSED errors during test cleanup
  // These occur when BatchSpanProcessor tries to flush spans after
  // the collector has been stopped - they're expected and harmless
  process.on('unhandledRejection', (reason: any) => {
    // Only suppress connection errors to localhost:4318 (the default OTLP port)
    // These are expected during shutdown when spans try to export after collector stops
    if (
      reason &&
      typeof reason === 'object' &&
      reason.code === 'ECONNREFUSED' &&
      (reason.address === '127.0.0.1' || reason.address === '::1') &&
      reason.port === 4318
    ) {
      // Silently ignore - this is expected during test teardown
      return
    }

    // For all other unhandled rejections, log them
    console.error('Unhandled Rejection:', reason)
  })
}

export default globalSetup
