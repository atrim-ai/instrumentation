/**
 * Centralized error definitions for @atrim/instrumentation
 *
 * All errors are tagged using Effect's Data.TaggedError for type-safe error handling
 */

import { Data } from 'effect'

/**
 * Configuration loading errors
 */
export class ConfigError extends Data.TaggedError('ConfigError')<{
  readonly message: string
  readonly cause?: unknown
}> {}

/**
 * File system operation errors
 */
export class FsError extends Data.TaggedError('FsError')<{
  readonly message: string
  readonly path: string
  readonly cause?: unknown
}> {}

/**
 * HTTP/Network operation errors
 */
export class HttpError extends Data.TaggedError('HttpError')<{
  readonly message: string
  readonly url?: string
  readonly status?: number
  readonly cause?: unknown
}> {}

/**
 * Validation errors (schema, pattern, etc.)
 */
export class ValidationError extends Data.TaggedError('ValidationError')<{
  readonly message: string
  readonly cause?: unknown
}> {}

/**
 * Pattern matching errors
 */
export class PatternError extends Data.TaggedError('PatternError')<{
  readonly message: string
  readonly pattern?: string
  readonly cause?: unknown
}> {}

/**
 * SDK initialization/lifecycle errors
 */
export class SdkError extends Data.TaggedError('SdkError')<{
  readonly message: string
  readonly cause?: unknown
}> {}

/**
 * Union of all instrumentation errors
 */
export type InstrumentationError =
  | ConfigError
  | FsError
  | HttpError
  | ValidationError
  | PatternError
  | SdkError
