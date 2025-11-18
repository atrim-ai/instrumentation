/**
 * Typed error hierarchy for @atrim/instrumentation
 *
 * These errors use Effect's Data.TaggedError for typed error handling
 * with proper discriminated unions.
 */

import { Data } from 'effect'

/**
 * Base error for configuration-related failures
 */
export class ConfigError extends Data.TaggedError('ConfigError')<{
  reason: string
  cause?: unknown
}> {
  override get message() {
    return this.reason
  }
}

/**
 * Error when fetching configuration from a URL fails
 */
export class ConfigUrlError extends Data.TaggedError('ConfigUrlError')<{
  reason: string
  cause?: unknown
}> {
  override get message() {
    return this.reason
  }
}

/**
 * Error when configuration validation fails (invalid YAML, schema mismatch)
 */
export class ConfigValidationError extends Data.TaggedError('ConfigValidationError')<{
  reason: string
  cause?: unknown
}> {
  override get message() {
    return this.reason
  }
}

/**
 * Error when reading configuration from a file fails
 */
export class ConfigFileError extends Data.TaggedError('ConfigFileError')<{
  reason: string
  cause?: unknown
}> {
  override get message() {
    return this.reason
  }
}

/**
 * Error when service detection fails (package.json not found, invalid format)
 */
export class ServiceDetectionError extends Data.TaggedError('ServiceDetectionError')<{
  reason: string
  cause?: unknown
}> {
  override get message() {
    return this.reason
  }
}

/**
 * Error when OpenTelemetry SDK initialization fails
 */
export class InitializationError extends Data.TaggedError('InitializationError')<{
  reason: string
  cause?: unknown
}> {
  override get message() {
    return this.reason
  }
}

/**
 * Error when span export fails (e.g., ECONNREFUSED to collector)
 */
export class ExportError extends Data.TaggedError('ExportError')<{
  reason: string
  cause?: unknown
}> {
  override get message() {
    return this.reason
  }
}

/**
 * Error when shutting down the SDK fails
 */
export class ShutdownError extends Data.TaggedError('ShutdownError')<{
  reason: string
  cause?: unknown
}> {
  override get message() {
    return this.reason
  }
}
