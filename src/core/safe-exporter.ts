/**
 * Safe OTLP Exporter Wrapper
 *
 * Wraps the standard OTLP exporter to catch and handle errors gracefully
 * instead of letting them become uncaught exceptions.
 *
 * This addresses the ECONNREFUSED errors that occur when:
 * 1. BatchSpanProcessor tries to export spans in the background
 * 2. The collector is not available
 * 3. The connection error escapes as an uncaught exception
 */

import type { ReadableSpan } from '@opentelemetry/sdk-trace-base'
import { logger } from './logger.js'

/**
 * Export result from span exporter
 */
export interface ExportResult {
  code: number // 0 = SUCCESS, 2 = FAILED
  error?: Error
}

/**
 * Generic span exporter interface
 */
export interface SpanExporter {
  export(spans: ReadableSpan[], resultCallback: (result: ExportResult) => void): void
  shutdown(): Promise<void>
  forceFlush?(): Promise<void>
}

/**
 * Safe exporter that wraps any span exporter and catches errors
 */
export class SafeSpanExporter implements SpanExporter {
  private readonly exporter: SpanExporter
  private errorCount = 0
  private lastErrorTime = 0
  private readonly errorThrottleMs = 60000 // Log errors max once per minute

  constructor(exporter: SpanExporter) {
    this.exporter = exporter
  }

  /**
   * Export spans with error handling
   */
  export(spans: ReadableSpan[], resultCallback: (result: ExportResult) => void): void {
    try {
      // Wrap the exporter's export method
      this.exporter.export(spans, (result) => {
        // Handle both success and failure results
        if (result.code !== 0 /* SUCCESS */) {
          this.handleExportError(result.error)
        }
        resultCallback(result)
      })
    } catch (error) {
      // Catch synchronous errors from the export call itself
      this.handleExportError(error)

      // Return failure result
      resultCallback({
        code: 2, // FAILED
        error: error instanceof Error ? error : new Error(String(error))
      })
    }
  }

  /**
   * Shutdown with error handling
   */
  async shutdown(): Promise<void> {
    try {
      await this.exporter.shutdown()
    } catch (error) {
      // Log but don't throw - shutdown errors are not critical
      logger.error(
        '@atrim/instrumentation: Error during exporter shutdown (non-critical):',
        error instanceof Error ? error.message : String(error)
      )
    }
  }

  /**
   * Force flush with error handling
   */
  async forceFlush(): Promise<void> {
    if (!this.exporter.forceFlush) {
      return
    }

    try {
      await this.exporter.forceFlush()
    } catch (error) {
      this.handleExportError(error)
    }
  }

  /**
   * Handle export errors with throttling
   */
  private handleExportError(error: unknown): void {
    this.errorCount++

    const now = Date.now()
    const shouldLog = now - this.lastErrorTime > this.errorThrottleMs

    if (shouldLog) {
      const errorMessage = error instanceof Error ? error.message : String(error)

      // Check if this is a connection error
      if (this.isConnectionError(error)) {
        logger.warn(`@atrim/instrumentation: Unable to export spans - collector not available`)
        logger.warn(`  Error: ${errorMessage}`)
        logger.warn(`  Spans will be dropped. Ensure OTEL collector is running.`)
      } else {
        logger.error('@atrim/instrumentation: Span export failed:', errorMessage)
      }

      if (this.errorCount > 1) {
        logger.warn(`  (${this.errorCount} errors total, throttled to 1/min)`)
      }

      this.lastErrorTime = now
      this.errorCount = 0 // Reset count after logging
    }
  }

  /**
   * Check if error is a connection error (ECONNREFUSED, ENOTFOUND, etc.)
   */
  private isConnectionError(error: unknown): boolean {
    if (!error || typeof error !== 'object') {
      return false
    }

    const err = error as { code?: string; message?: string; errors?: unknown[] }

    // Direct error code check
    if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND' || err.code === 'ETIMEDOUT') {
      return true
    }

    // AggregateError check (multiple connection attempts)
    if (Array.isArray(err.errors)) {
      return err.errors.every((e) => this.isConnectionError(e))
    }

    // Message-based check
    if (err.message) {
      const msg = err.message.toLowerCase()
      return (
        msg.includes('econnrefused') ||
        msg.includes('enotfound') ||
        msg.includes('etimedout') ||
        msg.includes('connection refused')
      )
    }

    return false
  }
}
