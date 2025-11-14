/**
 * @atrim/instrumentation-web
 *
 * OpenTelemetry instrumentation for Web/Browser applications
 *
 * @packageDocumentation
 */

// Re-export core schemas and types
export type { InstrumentationConfig, PatternConfig } from '@atrim/instrumentation-core'

// TODO: Implement Web-specific initialization
// - WebSDK initialization
// - Browser-friendly config loading (HTTP only, no file system)
// - LocalStorage or SessionStorage cache
// - Effect integration for Web (optional)

export function initializeInstrumentation() {
  console.warn('@atrim/instrumentation-web is not yet implemented')
  console.warn('This package will be implemented in a future release')
}
