/**
 * NodeSDK Initialization
 *
 * Provides comprehensive OpenTelemetry SDK initialization with smart defaults
 */

import { NodeSDK, NodeSDKConfiguration } from '@opentelemetry/sdk-node'
import { BatchSpanProcessor, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base'
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node'
import type { Instrumentation } from '@opentelemetry/instrumentation'
import { trace } from '@opentelemetry/api'
import type { RequestOptions, IncomingMessage } from 'node:http'
import { PatternSpanProcessor } from './span-processor.js'
import { createOtlpExporter, type OtlpExporterOptions } from './exporter-factory.js'
import { SafeSpanExporter } from './safe-exporter.js'
import { detectServiceInfoAsync } from './service-detector.js'
import { loadConfig, type ConfigLoaderOptions } from './config-loader.js'
import type { InstrumentationConfig, PatternConfig } from './instrumentation-schema.js'
import { initializePatternMatcher } from './pattern-matcher.js'
import { logger } from './logger.js'

export interface SdkInitializationOptions extends ConfigLoaderOptions {
  /**
   * OTLP exporter configuration
   */
  otlp?: OtlpExporterOptions

  /**
   * Service name
   * If not provided, auto-detects from OTEL_SERVICE_NAME or package.json
   */
  serviceName?: string

  /**
   * Service version
   * If not provided, auto-detects from OTEL_SERVICE_VERSION or package.json
   */
  serviceVersion?: string

  /**
   * Enable auto-instrumentation
   * Default: auto-detected based on your runtime and framework
   * - true: Enables Express, HTTP, and other common instrumentations
   * - false: Disables all auto-instrumentation (manual spans only)
   * - undefined: Smart detection (checks for Effect-TS usage)
   */
  autoInstrument?: boolean

  /**
   * Custom instrumentations to add
   * These are added in addition to auto-instrumentations (if enabled)
   */
  instrumentations?: Instrumentation[]

  /**
   * Advanced: Full NodeSDK configuration override
   * Provides complete control over SDK initialization
   */
  sdk?: Partial<NodeSDKConfiguration>

  /**
   * Disable automatic shutdown handler registration
   * Default: false (automatic shutdown is enabled)
   */
  disableAutoShutdown?: boolean

  /**
   * HTTP instrumentation filtering configuration
   *
   * Allows filtering of HTTP requests to prevent noisy traces
   * (e.g., health checks, OTLP exports, internal endpoints)
   *
   * @example
   * ```typescript
   * // Pattern-based filtering
   * http: {
   *   ignoreOutgoingUrls: [/\/health$/, /\/v1\/traces$/],
   *   ignoreIncomingPaths: [/^\/health$/]
   * }
   *
   * // Custom hook for advanced filtering
   * http: {
   *   ignoreOutgoingRequestHook: (req) => {
   *     const path = req.path || ''
   *     return path.includes('otel-collector')
   *   }
   * }
   * ```
   */
  http?: {
    /**
     * URL patterns to ignore for outgoing HTTP requests
     * Can be strings or RegExp patterns
     */
    ignoreOutgoingUrls?: (string | RegExp)[]

    /**
     * Path patterns to ignore for incoming HTTP requests
     * Can be strings or RegExp patterns
     */
    ignoreIncomingPaths?: (string | RegExp)[]

    /**
     * Custom hook for filtering outgoing HTTP requests
     * Return true to ignore the request (no span created)
     *
     * Note: The request parameter is RequestOptions (from http.request()),
     * not the ClientRequest object
     */
    ignoreOutgoingRequestHook?: (req: RequestOptions) => boolean

    /**
     * Custom hook for filtering incoming HTTP requests
     * Return true to ignore the request (no span created)
     */
    ignoreIncomingRequestHook?: (req: IncomingMessage) => boolean

    /**
     * Require parent span for outgoing requests
     * Prevents root spans for HTTP calls (useful for avoiding noise)
     */
    requireParentForOutgoingSpans?: boolean
  }
}

/**
 * Global SDK instance
 */
let sdkInstance: NodeSDK | null = null

/**
 * Ongoing initialization promise (prevents race conditions)
 */
let initializationPromise: Promise<NodeSDK | null> | null = null

/**
 * HTTP instrumentation config that matches @opentelemetry/instrumentation-http
 * We define this inline to avoid importing from the package (which is a transitive dependency)
 */
interface HttpInstrumentationConfigBuilder {
  enabled: boolean
  ignoreOutgoingRequestHook?: (req: RequestOptions) => boolean
  ignoreIncomingRequestHook?: (req: IncomingMessage) => boolean
  requireParentforOutgoingSpans?: boolean
}

/**
 * Build HTTP instrumentation configuration from options and config
 *
 * Merges YAML config, programmatic options, and smart defaults
 */
function buildHttpInstrumentationConfig(
  options: SdkInitializationOptions,
  config: InstrumentationConfig,
  _otlpEndpoint: string
): HttpInstrumentationConfigBuilder {
  const httpConfig: HttpInstrumentationConfigBuilder = { enabled: true }

  // Build outgoing request filter from YAML config and programmatic options ONLY
  // No hardcoded defaults - everything must be explicit in instrumentation.yaml
  const programmaticPatterns = options.http?.ignoreOutgoingUrls || []
  const yamlPatterns = config.http?.ignore_outgoing_urls || []

  // Combine all patterns (NO defaults)
  const allOutgoingPatterns = [
    ...programmaticPatterns.map((p) => (typeof p === 'string' ? new RegExp(p) : p)),
    ...yamlPatterns.map((p) => new RegExp(p))
  ]

  // Log what we're building
  console.log('[HTTP CONFIG BUILDER]', {
    programmaticPatterns: programmaticPatterns.length,
    yamlPatterns: yamlPatterns.length,
    totalPatterns: allOutgoingPatterns.length,
    patterns: allOutgoingPatterns.map((p) => p.source)
  })

  // Build the hook (always create it if we have any patterns)
  if (options.http?.ignoreOutgoingRequestHook) {
    // Use custom hook if provided
    console.log('[HTTP CONFIG] Using custom hook')
    httpConfig.ignoreOutgoingRequestHook = options.http.ignoreOutgoingRequestHook
  } else if (allOutgoingPatterns.length > 0) {
    console.log('[HTTP CONFIG] Building hook from patterns')
    // Build hook from YAML/programmatic patterns ONLY
    httpConfig.ignoreOutgoingRequestHook = (req: RequestOptions) => {
      // RequestOptions has: hostname, host, port, path, protocol, etc.
      const hostname = req.hostname || req.host || ''
      const port = req.port || ''
      const protocol = req.protocol || 'http:'
      const path = req.path || ''

      // Build full URL for pattern matching
      const portStr = port ? `:${port}` : ''
      const url = `${protocol}//${hostname}${portStr}${path}`

      // ALWAYS log for debugging
      console.log('[HTTP FILTER HOOK CALLED]', {
        url,
        hostname,
        port,
        path,
        patterns: allOutgoingPatterns.map((p) => p.source)
      })

      // Check patterns against both URL and path
      const matchesPattern = allOutgoingPatterns.some(
        (pattern) => pattern.test(url) || pattern.test(path)
      )

      if (matchesPattern) {
        console.log('[HTTP FILTER] ✅ Filtered by YAML/programmatic pattern:', url)
        return true
      }

      console.log('[HTTP FILTER] ❌ NOT filtered - no matching pattern:', url)
      return false
    }
  }

  // Step 3: Build incoming request filter
  const programmaticIncomingPatterns = options.http?.ignoreIncomingPaths || []
  const yamlIncomingPatterns = config.http?.ignore_incoming_paths || []

  const allIncomingPatterns = [
    ...programmaticIncomingPatterns.map((p) => (typeof p === 'string' ? new RegExp(p) : p)),
    ...yamlIncomingPatterns.map((p) => new RegExp(p))
  ]

  if (options.http?.ignoreIncomingRequestHook) {
    // Use custom hook if provided
    httpConfig.ignoreIncomingRequestHook = options.http.ignoreIncomingRequestHook
  } else if (allIncomingPatterns.length > 0) {
    // Build hook from patterns
    httpConfig.ignoreIncomingRequestHook = (req: IncomingMessage) => {
      const path = req.url || ''
      return allIncomingPatterns.some((pattern) => pattern.test(path))
    }
  }

  // Step 4: Apply requireParentForOutgoingSpans setting
  if (
    options.http?.requireParentForOutgoingSpans !== undefined ||
    config.http?.require_parent_for_outgoing_spans !== undefined
  ) {
    httpConfig.requireParentforOutgoingSpans =
      options.http?.requireParentForOutgoingSpans ??
      config.http?.require_parent_for_outgoing_spans ??
      false
  }

  return httpConfig
}

/**
 * Build undici instrumentation configuration from options and config
 *
 * Undici powers the fetch API in Node.js 18+ and is used by the OTLP HTTP exporter
 * We must filter OTLP requests here to prevent trace loops
 */
function buildUndiciInstrumentationConfig(
  options: SdkInitializationOptions,
  config: InstrumentationConfig,
  _otlpEndpoint: string
) {
  const undiciConfig = { enabled: true } as Record<string, unknown>

  // Get programmatic and YAML patterns ONLY (NO hardcoded defaults)
  const programmaticPatterns = options.http?.ignoreOutgoingUrls || []
  const yamlPatterns = config.http?.ignore_outgoing_urls || []

  // Combine all patterns (NO defaults)
  const allPatterns = [
    ...programmaticPatterns.map((p) => (typeof p === 'string' ? new RegExp(p) : p)),
    ...yamlPatterns.map((p) => new RegExp(p))
  ]

  // Only create ignoreRequestHook if we have patterns to check
  if (allPatterns.length > 0) {
    // Build ignoreRequestHook for undici
    // Note: undici's hook receives a UndiciRequest object with origin, path, method
    undiciConfig.ignoreRequestHook = (request: {
      origin: string
      path: string
      method: string
    }) => {
      const origin = request.origin
      const path = request.path
      const url = `${origin}${path}`

      // ALWAYS log to verify hook is being called
      console.log('[UNDICI FILTER HOOK CALLED]', {
        method: request.method,
        origin,
        path,
        url,
        patterns: allPatterns.map((p) => p.source)
      })

      // Check patterns from YAML/programmatic config ONLY
      const matchesPattern = allPatterns.some((pattern) => pattern.test(url) || pattern.test(path))
      if (matchesPattern) {
        console.log('[UNDICI FILTER] ✅ Filtered by YAML/programmatic pattern:', url)
        return true
      }

      console.log('[UNDICI FILTER] ❌ NOT filtered - no matching pattern:', url)
      return false
    }
  } else {
    console.log('[UNDICI FILTER] No patterns configured - all requests will be traced')
  }

  return undiciConfig
}

/**
 * Detect if Effect-TS is being used in the project
 *
 * Checks if the 'effect' package is installed
 */
function isEffectProject(): boolean {
  try {
    // Try to resolve the effect package
    require.resolve('effect')
    return true
  } catch {
    return false
  }
}

/**
 * Determine if auto-instrumentation should be enabled
 *
 * Smart defaults:
 * - If explicitly set, use that value
 * - If Effect-TS is detected AND no web framework detected, default to false
 * - Otherwise, default to true
 */
function shouldEnableAutoInstrumentation(
  explicitValue: boolean | undefined,
  hasWebFramework: boolean
): boolean {
  // If explicitly set, honor that
  if (explicitValue !== undefined) {
    return explicitValue
  }

  // Smart detection: Effect-only projects (no web framework) don't need auto-instrumentation
  // Effect with Express/Fastify/etc DOES benefit from auto-instrumentation
  const isEffect = isEffectProject()

  if (isEffect && !hasWebFramework) {
    logger.log('@atrim/instrumentation: Detected Effect-TS without web framework')
    logger.log('  - Auto-instrumentation disabled by default')
    logger.log('  - Effect.withSpan() will create spans')
    return false
  }

  // Default: enable auto-instrumentation
  return true
}

/**
 * Detect if a web framework is likely being used
 *
 * Checks for common web framework packages
 */
function hasWebFrameworkInstalled(): boolean {
  const frameworks = ['express', 'fastify', 'koa', '@hono/node-server', 'restify']

  for (const framework of frameworks) {
    try {
      require.resolve(framework)
      return true
    } catch {
      // Framework not found, continue
    }
  }

  return false
}

/**
 * Check if OpenTelemetry tracing is already initialized
 *
 * Detects if a TracerProvider has already been registered globally
 */
function isTracingAlreadyInitialized(): boolean {
  try {
    const provider = trace.getTracerProvider()

    // The default uninitialized state is a ProxyTracerProvider that wraps NoopTracerProvider
    // After NodeSDK.start(), it becomes a ProxyTracerProvider that wraps a real provider
    // We can detect this by checking for the _delegate property
    const providerWithDelegate = provider as unknown as {
      _delegate?: unknown
      getDelegate?: () => unknown
    }
    const delegate = providerWithDelegate._delegate || providerWithDelegate.getDelegate?.()

    if (delegate) {
      // Check if the delegate is not a NoopTracerProvider
      const delegateName = (delegate as { constructor: { name: string } }).constructor.name
      if (!delegateName.includes('Noop')) {
        return true
      }
    }

    // Also check for direct TracerProvider properties (resource, activeSpanProcessor, etc.)
    // These exist on real providers but not on NoopTracerProvider
    const providerWithProps = provider as unknown as {
      resource?: unknown
      activeSpanProcessor?: unknown
      _tracers?: unknown
    }
    const hasResource = providerWithProps.resource !== undefined
    const hasActiveSpanProcessor = providerWithProps.activeSpanProcessor !== undefined
    const hasTracers = providerWithProps._tracers !== undefined

    return hasResource || hasActiveSpanProcessor || hasTracers
  } catch {
    return false
  }
}

/**
 * Initialize OpenTelemetry NodeSDK with pattern-based span filtering
 *
 * This function:
 * 1. Detects if OpenTelemetry is already initialized (skips SDK setup if so)
 * 2. Loads instrumentation configuration (patterns, etc.)
 * 3. Creates OTLP exporter with smart defaults
 * 4. Sets up BatchSpanProcessor → PatternSpanProcessor chain
 * 5. Initializes NodeSDK with auto-instrumentations
 * 6. Registers graceful shutdown handlers
 *
 * If tracing is already initialized, this function will only set up pattern
 * matching and skip NodeSDK initialization.
 *
 * @returns The initialized NodeSDK instance, or null if skipped
 */
export async function initializeSdk(
  options: SdkInitializationOptions = {}
): Promise<NodeSDK | null> {
  // Check if we already initialized via this library
  if (sdkInstance) {
    logger.warn('@atrim/instrumentation: SDK already initialized. Returning existing instance.')
    return sdkInstance
  }

  // Check if initialization is already in progress (prevents race conditions)
  if (initializationPromise) {
    logger.log(
      '@atrim/instrumentation: SDK already initialized, waiting for initialization to complete...'
    )
    return initializationPromise
  }

  // Start initialization and track the promise
  initializationPromise = performInitialization(options)

  try {
    const result = await initializationPromise
    return result
  } finally {
    // Clear the promise once initialization is complete
    initializationPromise = null
  }
}

/**
 * Internal initialization implementation
 */
async function performInitialization(options: SdkInitializationOptions): Promise<NodeSDK | null> {
  // 1. Load configuration first (including logging level)
  const config = await loadConfig(options)

  // 2. Configure logger based on config
  const loggingLevel = config.instrumentation.logging || 'on'
  logger.setLevel(loggingLevel)

  // Check if OpenTelemetry is already initialized elsewhere
  const alreadyInitialized = isTracingAlreadyInitialized()

  if (alreadyInitialized) {
    logger.log('@atrim/instrumentation: Detected existing OpenTelemetry initialization.')
    logger.log('  - Skipping NodeSDK setup')
    logger.log('  - Setting up pattern-based filtering only')
    logger.log('')

    // Initialize pattern matcher for filtering
    initializePatternMatcher(config)

    logger.log('@atrim/instrumentation: Pattern filtering initialized')
    logger.log('  ⚠️  Note: Pattern filtering will only work with manual spans')
    logger.log('  ⚠️  Auto-instrumentation must be configured separately')
    logger.log('')

    return null
  }

  // 3. Detect service info
  const serviceInfo = await detectServiceInfoAsync()
  const serviceName = options.serviceName || serviceInfo.name
  const serviceVersion = options.serviceVersion || serviceInfo.version

  // 4. Create OTLP exporter wrapped in SafeSpanExporter
  // The safe exporter catches and handles connection errors gracefully
  // instead of letting them escape as uncaught exceptions
  const rawExporter = createOtlpExporter(options.otlp)
  const exporter = new SafeSpanExporter(rawExporter)

  // 5. Create span processor chain
  // Use SimpleSpanProcessor in test mode to avoid shutdown race conditions
  // with BatchSpanProcessor's background export timer
  const useSimpleProcessor =
    process.env.NODE_ENV === 'test' || process.env.OTEL_USE_SIMPLE_PROCESSOR === 'true'
  const baseProcessor = useSimpleProcessor
    ? new SimpleSpanProcessor(exporter)
    : new BatchSpanProcessor(exporter)
  const patternProcessor = new PatternSpanProcessor(config, baseProcessor)

  // 6. Prepare instrumentations
  const instrumentations: Instrumentation[] = []

  // Determine if auto-instrumentation should be enabled
  const hasWebFramework = hasWebFrameworkInstalled()
  const enableAutoInstrumentation = shouldEnableAutoInstrumentation(
    options.autoInstrument,
    hasWebFramework
  )

  // Add auto-instrumentations if enabled
  if (enableAutoInstrumentation) {
    // Get OTLP endpoint for HTTP filtering
    const otlpEndpoint =
      options.otlp?.endpoint ||
      process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT ||
      process.env.OTEL_EXPORTER_OTLP_ENDPOINT ||
      'http://localhost:4318/v1/traces'

    // Build HTTP instrumentation config with filtering
    const httpConfig = buildHttpInstrumentationConfig(options, config, otlpEndpoint)

    // Build undici instrumentation config (for fetch/undici in Node.js 18+)
    // The OTLP HTTP exporter uses fetch, which uses undici
    const undiciConfig = buildUndiciInstrumentationConfig(options, config, otlpEndpoint)

    // DEBUG: Log the configurations being applied
    console.log('[HTTP/UNDICI CONFIG DEBUG]', {
      otlpEndpoint,
      httpConfigHasHook: !!httpConfig.ignoreOutgoingRequestHook,
      undiciConfigHasHook: !!(undiciConfig as Record<string, unknown>).ignoreRequestHook,
      yamlHttpPatterns: config.http?.ignore_outgoing_urls,
      programmaticHttpPatterns: options.http?.ignoreOutgoingUrls
    })

    // Log the actual config objects being passed
    console.log('[INSTRUMENTATION CONFIG]', {
      httpConfig: JSON.stringify(
        {
          enabled: httpConfig.enabled,
          hasIgnoreHook: !!httpConfig.ignoreOutgoingRequestHook,
          hookType: typeof httpConfig.ignoreOutgoingRequestHook
        },
        null,
        2
      ),
      undiciConfig: JSON.stringify(
        {
          enabled: (undiciConfig as Record<string, unknown>).enabled,
          hasIgnoreHook: !!(undiciConfig as Record<string, unknown>).ignoreRequestHook,
          hookType: typeof (undiciConfig as Record<string, unknown>).ignoreRequestHook
        },
        null,
        2
      )
    })

    instrumentations.push(
      ...getNodeAutoInstrumentations({
        // Enable HTTP instrumentation with filtering (for http/https modules)
        '@opentelemetry/instrumentation-http': httpConfig,

        // Enable undici instrumentation with filtering (for fetch API)
        '@opentelemetry/instrumentation-undici': undiciConfig,

        // Enable web framework instrumentations
        '@opentelemetry/instrumentation-express': { enabled: true },
        '@opentelemetry/instrumentation-fastify': { enabled: true },
        '@opentelemetry/instrumentation-koa': { enabled: true },

        // Disable noisy instrumentations by default
        '@opentelemetry/instrumentation-fs': { enabled: false },
        '@opentelemetry/instrumentation-dns': { enabled: false }
      })
    )

    console.log('[INSTRUMENTATIONS] Created', instrumentations.length, 'instrumentations')
    instrumentations.forEach((inst) => {
      console.log('  -', inst.instrumentationName)
    })
  }

  // Add custom instrumentations
  if (options.instrumentations) {
    instrumentations.push(...options.instrumentations)
  }

  // For pure Effect apps (no auto-instrumentation), skip NodeSDK entirely
  // This prevents any default instrumentations (like undici) from interfering with Effect layer
  if (!enableAutoInstrumentation && instrumentations.length === 0) {
    const wasExplicit = options.autoInstrument === false
    const detectionMessage = wasExplicit
      ? '@atrim/instrumentation: Auto-instrumentation: disabled'
      : '@atrim/instrumentation: Pure Effect-TS app detected (auto-detected)'

    logger.log(detectionMessage)
    logger.log('  - Skipping NodeSDK setup')
    logger.log('  - Pattern matching configured from instrumentation.yaml')
    if (!wasExplicit) {
      logger.log('  - Use EffectInstrumentationLive for tracing')
    }
    logger.log('')

    // Initialize pattern matcher so filtering works with Effect spans
    initializePatternMatcher(config)

    return null
  }

  // 7. Create NodeSDK configuration
  // Type cast to handle OpenTelemetry version mismatches
  const sdkConfig = {
    spanProcessor: patternProcessor,
    serviceName,
    ...(serviceVersion && { serviceVersion }),
    instrumentations,
    // Allow advanced overrides
    ...options.sdk
  } as NodeSDKConfiguration

  // 8. Initialize SDK
  const sdk = new NodeSDK(sdkConfig)
  sdk.start()
  sdkInstance = sdk

  // 9. Register shutdown handlers (unless disabled)
  if (!options.disableAutoShutdown) {
    registerShutdownHandlers(sdk)
  }

  // 10. Log initialization details
  logInitialization(config, serviceName, serviceVersion, options, enableAutoInstrumentation)

  return sdk
}

/**
 * Get the current SDK instance
 */
export function getSdkInstance(): NodeSDK | null {
  return sdkInstance
}

/**
 * Shutdown the SDK
 */
export async function shutdownSdk(): Promise<void> {
  if (!sdkInstance) {
    return
  }

  await sdkInstance.shutdown()
  sdkInstance = null
}

/**
 * Reset SDK instance (useful for testing)
 */
export function resetSdk(): void {
  sdkInstance = null
  initializationPromise = null
}

/**
 * Register graceful shutdown handlers
 */
function registerShutdownHandlers(sdk: NodeSDK): void {
  const shutdown = async (signal: string) => {
    logger.log(`\n@atrim/instrumentation: Received ${signal}, shutting down gracefully...`)
    try {
      await sdk.shutdown()
      logger.log('@atrim/instrumentation: Shutdown complete')
      process.exit(0)
    } catch (error) {
      logger.error(
        '@atrim/instrumentation: Error during shutdown:',
        error instanceof Error ? error.message : String(error)
      )
      process.exit(1)
    }
  }

  // Handle various shutdown signals
  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT', () => shutdown('SIGINT'))

  // Handle uncaught errors
  process.on('uncaughtException', async (error) => {
    logger.error('@atrim/instrumentation: Uncaught exception:', error)
    await sdk.shutdown()
    process.exit(1)
  })

  process.on('unhandledRejection', async (reason) => {
    logger.error('@atrim/instrumentation: Unhandled rejection:', reason)
    await sdk.shutdown()
    process.exit(1)
  })
}

/**
 * Log initialization details
 */
function logInitialization(
  config: InstrumentationConfig,
  serviceName: string,
  serviceVersion: string | undefined,
  options: SdkInitializationOptions,
  autoInstrumentEnabled: boolean
): void {
  // Use minimal() for the main initialization message (shown in minimal mode)
  logger.minimal('@atrim/instrumentation: SDK initialized successfully')

  // All other details are only shown in full logging mode
  logger.log(`  - Service: ${serviceName}${serviceVersion ? ` v${serviceVersion}` : ''}`)

  if (config.instrumentation.enabled) {
    const instrumentCount = config.instrumentation.instrument_patterns.filter(
      (p: PatternConfig) => p.enabled !== false
    ).length
    const ignoreCount = config.instrumentation.ignore_patterns.length

    logger.log(`  - Pattern filtering: enabled`)
    logger.log(`    - Instrument patterns: ${instrumentCount}`)
    logger.log(`    - Ignore patterns: ${ignoreCount}`)
  } else {
    logger.log(`  - Pattern filtering: disabled`)
  }

  // Show auto-instrumentation status
  const autoInstrumentLabel = autoInstrumentEnabled ? 'enabled' : 'disabled'
  const autoDetected = options.autoInstrument === undefined ? ' (auto-detected)' : ''
  logger.log(`  - Auto-instrumentation: ${autoInstrumentLabel}${autoDetected}`)

  if (options.instrumentations && options.instrumentations.length > 0) {
    logger.log(`  - Custom instrumentations: ${options.instrumentations.length}`)
  }

  // Log OTLP endpoint (helpful for debugging)
  const endpoint =
    options.otlp?.endpoint ||
    process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT ||
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT ||
    'http://localhost:4318/v1/traces'
  logger.log(`  - OTLP endpoint: ${endpoint}`)

  logger.log('')
}
