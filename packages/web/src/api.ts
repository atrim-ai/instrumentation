/**
 * Public API for @atrim/instrument-web
 *
 * Main initialization functions for browser instrumentation
 */

import { Effect } from 'effect'
import type { WebTracerProvider } from '@opentelemetry/sdk-trace-web'
import { initializeSdkEffect, type SdkInitializationOptions } from './core/sdk-initializer.js'
import { InitializationError } from '@atrim/instrument-core'

/**
 * Initialize OpenTelemetry instrumentation for browser
 *
 * This is the main entry point for setting up tracing in browser applications.
 * Call this function once at application startup, before any other code runs.
 *
 * @param options - Initialization options
 * @returns Effect that yields WebTracerProvider instance
 *
 * @example
 * ```typescript
 * import { Effect } from 'effect'
 * import { initializeInstrumentation } from '@atrim/instrument-web'
 *
 * const program = initializeInstrumentation({
 *   serviceName: 'my-app',
 *   otlpEndpoint: 'http://localhost:4318/v1/traces'
 * })
 *
 * await Effect.runPromise(program)
 * ```
 *
 * @example With pattern-based filtering
 * ```typescript
 * const program = initializeInstrumentation({
 *   serviceName: 'my-app',
 *   configUrl: 'https://config.company.com/instrumentation.yaml'
 * })
 *
 * await Effect.runPromise(program)
 * ```
 *
 * @example With error handling
 * ```typescript
 * const program = initializeInstrumentation({
 *   serviceName: 'my-app',
 *   enableUserInteraction: false
 * }).pipe(
 *   Effect.catchTag('InitializationError', (error) => {
 *     console.error('Failed to initialize:', error.reason)
 *     return Effect.die(error) // Re-throw or handle
 *   })
 * )
 *
 * await Effect.runPromise(program)
 * ```
 */
export const initializeInstrumentation = (
  options: SdkInitializationOptions
): Effect.Effect<WebTracerProvider, InitializationError> => initializeSdkEffect(options)
