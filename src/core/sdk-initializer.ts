/**
 * NodeSDK Initialization
 *
 * Provides comprehensive OpenTelemetry SDK initialization with smart defaults
 */

import { NodeSDK, NodeSDKConfiguration } from '@opentelemetry/sdk-node'
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base'
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node'
import type { Instrumentation } from '@opentelemetry/instrumentation'
import { trace } from '@opentelemetry/api'
import { PatternSpanProcessor } from './span-processor.js'
import { createOtlpExporter, type OtlpExporterOptions } from './exporter-factory.js'
import { detectServiceInfo } from './service-detector.js'
import { loadConfig, type ConfigLoaderOptions } from './config-loader.js'
import { initializePatternMatcher } from './pattern-matcher.js'

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
   * Default: true (enables Express, HTTP, and other common instrumentations)
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
}

/**
 * Global SDK instance
 */
let sdkInstance: NodeSDK | null = null

/**
 * Check if OpenTelemetry tracing is already initialized
 *
 * Detects if a TracerProvider has already been registered globally
 */
function isTracingAlreadyInitialized(): boolean {
  try {
    const provider = trace.getTracerProvider()
    // Check if the provider has been explicitly set (not the default NoopTracerProvider)
    // The name property exists on registered providers but not on NoopTracerProvider
    return (provider as any).resource !== undefined
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
export async function initializeSdk(options: SdkInitializationOptions = {}): Promise<NodeSDK | null> {
  // Check if we already initialized via this library
  if (sdkInstance) {
    console.warn('@atrim/instrumentation: SDK already initialized by this library. Returning existing instance.')
    return sdkInstance
  }

  // Check if OpenTelemetry is already initialized elsewhere
  const alreadyInitialized = isTracingAlreadyInitialized()

  if (alreadyInitialized) {
    console.log('@atrim/instrumentation: Detected existing OpenTelemetry initialization.')
    console.log('  - Skipping NodeSDK setup')
    console.log('  - Setting up pattern-based filtering only')
    console.log('')

    // Still load config and initialize pattern matcher for filtering
    const config = await loadConfig(options)
    initializePatternMatcher(config)

    console.log('@atrim/instrumentation: Pattern filtering initialized')
    console.log('  ⚠️  Note: Pattern filtering will only work with manual spans')
    console.log('  ⚠️  Auto-instrumentation must be configured separately')
    console.log('')

    return null
  }

  // 1. Load configuration for pattern matching
  const config = await loadConfig(options)

  // 2. Detect service info
  const serviceInfo = await detectServiceInfo()
  const serviceName = options.serviceName || serviceInfo.name
  const serviceVersion = options.serviceVersion || serviceInfo.version

  // 3. Create OTLP exporter
  const exporter = createOtlpExporter(options.otlp)

  // 4. Create span processor chain
  const batchProcessor = new BatchSpanProcessor(exporter)
  const patternProcessor = new PatternSpanProcessor(config, batchProcessor)

  // 5. Prepare instrumentations
  const instrumentations: Instrumentation[] = []

  // Add auto-instrumentations if enabled (default: true)
  if (options.autoInstrument !== false) {
    instrumentations.push(
      ...getNodeAutoInstrumentations({
        // Enable common instrumentations
        '@opentelemetry/instrumentation-http': { enabled: true },
        '@opentelemetry/instrumentation-express': { enabled: true },
        '@opentelemetry/instrumentation-fastify': { enabled: true },
        '@opentelemetry/instrumentation-koa': { enabled: true },

        // Disable noisy instrumentations by default
        '@opentelemetry/instrumentation-fs': { enabled: false },
        '@opentelemetry/instrumentation-dns': { enabled: false }
      })
    )
  }

  // Add custom instrumentations
  if (options.instrumentations) {
    instrumentations.push(...options.instrumentations)
  }

  // 6. Create NodeSDK configuration
  // Type cast to handle OpenTelemetry version mismatches
  const sdkConfig = {
    spanProcessor: patternProcessor,
    serviceName,
    ...(serviceVersion && { serviceVersion }),
    instrumentations,
    // Allow advanced overrides
    ...options.sdk
  } as NodeSDKConfiguration

  // 7. Initialize SDK
  const sdk = new NodeSDK(sdkConfig)
  sdk.start()
  sdkInstance = sdk

  // 8. Register shutdown handlers (unless disabled)
  if (!options.disableAutoShutdown) {
    registerShutdownHandlers(sdk)
  }

  // 9. Log initialization details
  logInitialization(config, serviceName, serviceVersion, options)

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
}

/**
 * Register graceful shutdown handlers
 */
function registerShutdownHandlers(sdk: NodeSDK): void {
  const shutdown = async (signal: string) => {
    console.log(`\n@atrim/instrumentation: Received ${signal}, shutting down gracefully...`)
    try {
      await sdk.shutdown()
      console.log('@atrim/instrumentation: Shutdown complete')
      process.exit(0)
    } catch (error) {
      console.error(
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
    console.error('@atrim/instrumentation: Uncaught exception:', error)
    await sdk.shutdown()
    process.exit(1)
  })

  process.on('unhandledRejection', async (reason) => {
    console.error('@atrim/instrumentation: Unhandled rejection:', reason)
    await sdk.shutdown()
    process.exit(1)
  })
}

/**
 * Log initialization details
 */
function logInitialization(
  config: any,
  serviceName: string,
  serviceVersion: string | undefined,
  options: SdkInitializationOptions
): void {
  console.log('@atrim/instrumentation: SDK initialized successfully')
  console.log(`  - Service: ${serviceName}${serviceVersion ? ` v${serviceVersion}` : ''}`)

  if (config.instrumentation.enabled) {
    const instrumentCount = config.instrumentation.instrument_patterns.filter(
      (p: any) => p.enabled !== false
    ).length
    const ignoreCount = config.instrumentation.ignore_patterns.length

    console.log(`  - Pattern filtering: enabled`)
    console.log(`    - Instrument patterns: ${instrumentCount}`)
    console.log(`    - Ignore patterns: ${ignoreCount}`)
  } else {
    console.log(`  - Pattern filtering: disabled`)
  }

  console.log(`  - Auto-instrumentation: ${options.autoInstrument !== false ? 'enabled' : 'disabled'}`)

  if (options.instrumentations && options.instrumentations.length > 0) {
    console.log(`  - Custom instrumentations: ${options.instrumentations.length}`)
  }

  // Log OTLP endpoint (helpful for debugging)
  const endpoint =
    options.otlp?.endpoint ||
    process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT ||
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT ||
    'http://localhost:4318/v1/traces'
  console.log(`  - OTLP endpoint: ${endpoint}`)

  console.log('')
}
