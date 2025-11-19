/**
 * SDK Initializer for Browser
 *
 * Initializes the OpenTelemetry WebTracerProvider with:
 * - Auto-instrumentation (fetch, XHR, document load, user interactions)
 * - Pattern-based span filtering
 * - OTLP HTTP export
 */

import { Effect, Deferred } from 'effect'
import { WebTracerProvider } from '@opentelemetry/sdk-trace-web'
import { SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base'
import { registerInstrumentations } from '@opentelemetry/instrumentation'
import { getWebAutoInstrumentations } from '@opentelemetry/auto-instrumentations-web'
import { ZoneContextManager } from '@opentelemetry/context-zone'
import type { InstrumentationConfig } from '@atrim/instrument-core'
import { initializePatternMatcher, InitializationError } from '@atrim/instrument-core'
import { loadConfig, loadConfigFromInline } from '../services/config-loader.js'
import { createOtlpExporter, type OtlpExporterOptions } from './exporter-factory.js'
import { PatternSpanProcessor } from './span-processor.js'

export interface SdkInitializationOptions {
  /**
   * Service name (required for browser - no auto-detection)
   * @example 'my-app-frontend'
   */
  serviceName: string

  /**
   * Service version (optional)
   * @example '1.0.0'
   */
  serviceVersion?: string

  /**
   * Path to instrumentation.yaml file
   * Note: Only works if file is publicly accessible
   */
  configPath?: string

  /**
   * URL to remote instrumentation.yaml
   * @example 'https://config.company.com/instrumentation.yaml'
   */
  configUrl?: string

  /**
   * Inline configuration object (takes precedence over file/URL)
   */
  config?: InstrumentationConfig

  /**
   * OTLP endpoint URL
   * @default 'http://localhost:4318/v1/traces'
   */
  otlpEndpoint?: string

  /**
   * OTLP HTTP headers
   * @example { 'Authorization': 'Bearer token' }
   */
  otlpHeaders?: Record<string, string>

  /**
   * Enable document load instrumentation
   * @default true
   */
  enableDocumentLoad?: boolean

  /**
   * Enable user interaction instrumentation
   * @default true
   */
  enableUserInteraction?: boolean

  /**
   * Enable fetch API instrumentation
   * @default true
   */
  enableFetch?: boolean

  /**
   * Enable XMLHttpRequest instrumentation
   * @default true
   */
  enableXhr?: boolean
}

// Singleton instance
let sdkInstance: WebTracerProvider | null = null

/**
 * Ongoing initialization deferred (prevents race conditions)
 * Uses Effect's Deferred for proper Effect-based coordination
 */
let initializationDeferred: Deferred.Deferred<WebTracerProvider, InitializationError> | null = null

/**
 * Initialize the OpenTelemetry SDK for browser (Effect version)
 *
 * Uses Deferred to ensure one-time initialization and prevent race conditions.
 *
 * @param options - SDK initialization options
 * @returns Effect that yields WebTracerProvider instance
 *
 * @example
 * ```typescript
 * import { Effect } from 'effect'
 *
 * const program = initializeSdkEffect({
 *   serviceName: 'my-app',
 *   otlpEndpoint: 'http://localhost:4318/v1/traces'
 * })
 *
 * const provider = await Effect.runPromise(program)
 * ```
 */
export const initializeSdkEffect = (
  options: SdkInitializationOptions
): Effect.Effect<WebTracerProvider, InitializationError> =>
  Effect.gen(function* () {
    // Check if we already initialized
    if (sdkInstance) {
      return sdkInstance
    }

    // Check if initialization is already in progress (prevents race conditions)
    if (initializationDeferred) {
      return yield* Deferred.await(initializationDeferred)
    }

    // Create new deferred for this initialization
    const deferred = yield* Deferred.make<WebTracerProvider, InitializationError>()
    initializationDeferred = deferred

    // Perform initialization and handle success/failure
    const result = yield* performInitializationEffect(options).pipe(
      Effect.tap((provider) => Deferred.succeed(deferred, provider)),
      Effect.tapError((error) => Deferred.fail(deferred, error)),
      Effect.ensuring(
        Effect.sync(() => {
          // Clear the deferred once initialization is complete (success or failure)
          initializationDeferred = null
        })
      )
    )

    return result
  })

/**
 * Internal initialization implementation (Effect version)
 */
const performInitializationEffect = (
  options: SdkInitializationOptions
): Effect.Effect<WebTracerProvider, InitializationError> =>
  Effect.gen(function* () {
    // Load configuration (if specified)
    const config: InstrumentationConfig | null = yield* loadConfigEffect(options)

    // Initialize pattern matcher (if config available)
    if (config) {
      initializePatternMatcher(config)
    }

    // Build HTTP URL ignore patterns for fetch instrumentation
    const ignoreUrls = buildIgnoreUrls(config)

    // Create OTLP exporter
    const exporter = yield* Effect.sync(() => {
      const exporterOptions: OtlpExporterOptions = {}
      if (options.otlpEndpoint) {
        exporterOptions.endpoint = options.otlpEndpoint
      }
      if (options.otlpHeaders) {
        exporterOptions.headers = options.otlpHeaders
      }
      return createOtlpExporter(exporterOptions)
    })

    // Build span processors array
    const spanProcessors: Array<SimpleSpanProcessor | PatternSpanProcessor> = []

    // 1. Pattern-based filtering (if config available)
    if (config) {
      spanProcessors.push(new PatternSpanProcessor())
    }

    // 2. OTLP export (SimpleSpanProcessor for browser - no batching)
    spanProcessors.push(new SimpleSpanProcessor(exporter))

    // Create WebTracerProvider with processors
    const provider = yield* Effect.sync(() => {
      const p = new WebTracerProvider({
        spanProcessors
      })

      // Register the provider
      p.register({
        contextManager: new ZoneContextManager()
      })

      return p
    })

    // Register auto-instrumentations
    yield* Effect.sync(() => {
      registerInstrumentations({
        instrumentations: [
          getWebAutoInstrumentations({
            '@opentelemetry/instrumentation-document-load': {
              enabled: options.enableDocumentLoad ?? true
            },
            '@opentelemetry/instrumentation-user-interaction': {
              enabled: options.enableUserInteraction ?? true,
              eventNames: ['click', 'submit']
            },
            '@opentelemetry/instrumentation-fetch': {
              enabled: options.enableFetch ?? true,
              propagateTraceHeaderCorsUrls: [/.*/], // Propagate to all origins
              clearTimingResources: true,
              ignoreUrls // Prevent self-instrumentation of OTLP exports
            },
            '@opentelemetry/instrumentation-xml-http-request': {
              enabled: options.enableXhr ?? true,
              propagateTraceHeaderCorsUrls: [/.*/]
            }
          })
        ]
      })
    })

    sdkInstance = provider
    return provider
  })

/**
 * Load configuration using Effect (helper)
 */
const loadConfigEffect = (
  options: SdkInitializationOptions
): Effect.Effect<InstrumentationConfig | null, InitializationError> =>
  Effect.gen(function* () {
    if (options.config) {
      return yield* Effect.tryPromise({
        try: () => loadConfigFromInline(options.config!),
        catch: (error) =>
          new InitializationError({
            reason: 'Failed to load inline config',
            cause: error
          })
      })
    }

    if (options.configPath || options.configUrl) {
      const url = options.configUrl || options.configPath!
      return yield* Effect.tryPromise({
        try: () => loadConfig(url),
        catch: (error) =>
          new InitializationError({
            reason: `Failed to load config from ${url}`,
            cause: error
          })
      })
    }

    return null
  })

/**
 * Build URL ignore patterns for fetch instrumentation
 */
function buildIgnoreUrls(config: InstrumentationConfig | null): RegExp[] {
  // Start with fail-safe defaults to prevent self-instrumentation loops
  const ignoreUrls: RegExp[] = [
    // Always ignore standard OTLP endpoints (prevents infinite loops)
    /\/v1\/traces$/,
    /\/v1\/metrics$/,
    /\/v1\/logs$/
  ]

  // Add user-configured patterns from instrumentation.yaml
  if (config?.http?.ignore_outgoing_urls) {
    for (const pattern of config.http.ignore_outgoing_urls) {
      try {
        ignoreUrls.push(new RegExp(pattern))
      } catch (error) {
        console.warn(
          `[@atrim/instrument-web] Invalid ignore_outgoing_urls pattern: "${pattern}"`,
          error
        )
      }
    }
  } else {
    // Warn if no HTTP filtering config provided
    console.warn(
      '[@atrim/instrument-web] Missing http.ignore_outgoing_urls in instrumentation.yaml. ' +
        'Using default OTLP endpoint patterns only. ' +
        'Consider adding http filtering to your config for better control.'
    )
  }

  return ignoreUrls
}

// Re-export Effect API with simpler name
export const initializeSdk = initializeSdkEffect

/**
 * Get the current SDK instance
 *
 * @returns WebTracerProvider instance or null if not initialized
 */
export function getSdkInstance(): WebTracerProvider | null {
  return sdkInstance
}

/**
 * Shutdown the SDK gracefully
 *
 * Flushes pending spans and releases resources
 */
export async function shutdownSdk(): Promise<void> {
  if (sdkInstance) {
    await sdkInstance.shutdown()
    sdkInstance = null
  }
}

/**
 * Reset the SDK instance (for testing)
 *
 * Does not shutdown - just clears the singleton
 */
export function resetSdk(): void {
  sdkInstance = null
  initializationDeferred = null
}
