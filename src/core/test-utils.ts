/**
 * Test utilities for handling shutdown errors during testing
 */

interface NodeJSError extends Error {
  code?: string
  errno?: number
  syscall?: string
  address?: string
  port?: number
  errors?: NodeJSError[]
}

/**
 * Suppress ECONNREFUSED errors during shutdown in test environments
 *
 * This function installs error handlers that ignore connection refused errors
 * when the OpenTelemetry SDK tries to export spans during shutdown. This is
 * expected behavior when collectors are stopped before child processes finish.
 *
 * @example
 * ```typescript
 * import { suppressShutdownErrors } from '@atrim/instrumentation/test-utils'
 *
 * // Call at the start of your main function
 * suppressShutdownErrors()
 * ```
 */
export function suppressShutdownErrors(): void {
  // Only install handlers in CI or test environments
  if (!process.env.CI && process.env.NODE_ENV !== 'test') {
    return
  }

  const isHarmlessConnectionError = (error: unknown): boolean => {
    // Type guard to check if error is an object with the expected properties
    if (!error || typeof error !== 'object') {
      return false
    }

    const nodeError = error as NodeJSError

    // Check for direct ECONNREFUSED error
    if (nodeError.code === 'ECONNREFUSED') {
      return true
    }

    // Check for AggregateError with all ECONNREFUSED errors
    if (
      nodeError.errors &&
      Array.isArray(nodeError.errors) &&
      nodeError.errors.length > 0 &&
      nodeError.errors.every((e) => e?.code === 'ECONNREFUSED')
    ) {
      return true
    }

    return false
  }

  // Handle uncaught exceptions
  process.on('uncaughtException', (error: Error) => {
    if (isHarmlessConnectionError(error)) {
      console.log('📤 Export failed (collector stopped) - this is expected in tests')
      return
    }
    // Re-throw other errors
    console.error('Uncaught exception:', error)
    process.exit(1)
  })

  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason: unknown) => {
    if (isHarmlessConnectionError(reason)) {
      console.log('📤 Export failed (collector stopped) - this is expected in tests')
      return
    }
    // Re-throw other errors
    console.error('Unhandled rejection:', reason)
    process.exit(1)
  })
}