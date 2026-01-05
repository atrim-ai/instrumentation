/**
 * @atrim/instrument-core - Platform-agnostic instrumentation core
 *
 * Shared logic for configuration, pattern matching, and schema validation
 * across all platform packages (Node.js, Web, etc.)
 *
 * @packageDocumentation
 * @internal This is a private package
 */

// Configuration loading (Effect Platform-based services)
export { ConfigLoader, ConfigLoaderLive } from './services/config-loader.js'
export type { ConfigLoaderService } from './services/config-loader.js'

// Pattern matching
export {
  PatternMatcher,
  shouldInstrumentSpan,
  getPatternMatcher,
  initializePatternMatcher,
  clearPatternMatcher
} from './pattern-matcher.js'

// Schema and types
export {
  InstrumentationConfigSchema,
  PatternConfigSchema,
  defaultConfig,
  parseAndValidateConfig
} from './instrumentation-schema.js'
export type { InstrumentationConfig, PatternConfig } from './instrumentation-schema.js'

// Logging
export { logger } from './logger.js'
export type { LogLevel } from './logger.js'

// Error types (for Effect error handling)
export {
  ConfigError,
  ConfigUrlError,
  ConfigValidationError,
  ConfigFileError,
  ServiceDetectionError,
  InitializationError,
  ExportError,
  ShutdownError
} from './errors.js'
