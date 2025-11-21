/**
 * Shared test helpers for fiberset fixtures
 */

/**
 * Check if error is a harmless connection refused during shutdown
 */
export function isHarmlessConnectionError(error: any): boolean {
  if (error && typeof error === 'object' && error.code === 'ECONNREFUSED') {
    return true
  }
  if (error && error.errors && Array.isArray(error.errors)) {
    return error.errors.every((e: any) => e && e.code === 'ECONNREFUSED')
  }
  if (typeof error === 'string' && error.includes('ECONNREFUSED')) {
    return true
  }
  return false
}

/**
 * Install handlers to suppress ECONNREFUSED errors during test shutdown.
 */
export function suppressEconnrefused(): void {
  process.on('uncaughtException', (error: any) => {
    if (isHarmlessConnectionError(error)) {
      console.log('📤 Export failed (collector stopped) - this is expected in tests')
      return
    }
    console.error('Uncaught exception:', error)
    process.exit(1)
  })

  process.on('unhandledRejection', (reason: any) => {
    if (isHarmlessConnectionError(reason)) {
      console.log('📤 Export failed (collector stopped) - this is expected in tests')
      return
    }
    console.error('Unhandled rejection:', reason)
    process.exit(1)
  })
}
