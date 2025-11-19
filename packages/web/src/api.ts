/**
 * Public API for @atrim/instrument-web
 *
 * Main initialization functions for browser instrumentation
 */

import type { WebTracerProvider } from '@opentelemetry/sdk-trace-web'
import { initializeSdk, type SdkInitializationOptions } from './core/sdk-initializer.js'

/**
 * Initialize OpenTelemetry instrumentation for browser
 *
 * This is the main entry point for setting up tracing in browser applications.
 * Call this function once at application startup, before any other code runs.
 *
 * @param options - Initialization options
 * @returns WebTracerProvider instance
 * @throws {Error} If initialization fails
 *
 * @example
 * ```typescript
 * import { initializeInstrumentation } from '@atrim/instrument-web'
 *
 * await initializeInstrumentation({
 *   serviceName: 'my-app',
 *   otlpEndpoint: 'http://localhost:4318/v1/traces'
 * })
 * ```
 *
 * @example With pattern-based filtering
 * ```typescript
 * await initializeInstrumentation({
 *   serviceName: 'my-app',
 *   configUrl: 'https://config.company.com/instrumentation.yaml'
 * })
 * ```
 *
 * @example Disable specific instrumentations
 * ```typescript
 * await initializeInstrumentation({
 *   serviceName: 'my-app',
 *   enableUserInteraction: false, // Disable click tracking
 *   enableXhr: false // Disable XMLHttpRequest tracking
 * })
 * ```
 */
export async function initializeInstrumentation(
  options: SdkInitializationOptions
): Promise<WebTracerProvider> {
  return await initializeSdk(options)
}
