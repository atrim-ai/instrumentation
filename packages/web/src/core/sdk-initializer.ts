/**
 * SDK Initializer for Browser
 *
 * Initializes the OpenTelemetry WebTracerProvider with:
 * - Auto-instrumentation (fetch, XHR, document load, user interactions)
 * - Pattern-based span filtering
 * - OTLP HTTP export
 */

import { WebTracerProvider } from '@opentelemetry/sdk-trace-web'
import { SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base'
import { registerInstrumentations } from '@opentelemetry/instrumentation'
import { getWebAutoInstrumentations } from '@opentelemetry/auto-instrumentations-web'
import { ZoneContextManager } from '@opentelemetry/context-zone'
import type { InstrumentationConfig } from '@atrim/instrument-core'
import { initializePatternMatcher } from '@atrim/instrument-core'
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
 * Initialize the OpenTelemetry SDK for browser
 *
 * @param options - SDK initialization options
 * @returns WebTracerProvider instance
 * @throws {Error} If initialization fails
 *
 * @example
 * ```typescript
 * const provider = await initializeSdk({
 *   serviceName: 'my-app',
 *   otlpEndpoint: 'http://localhost:4318/v1/traces'
 * })
 * ```
 */
export async function initializeSdk(options: SdkInitializationOptions): Promise<WebTracerProvider> {
  if (sdkInstance) {
    return sdkInstance
  }

  try {
    // Load configuration (if specified)
    let config: InstrumentationConfig | null = null

    if (options.config) {
      config = await loadConfigFromInline(options.config)
    } else if (options.configPath || options.configUrl) {
      // In browser, configPath is treated as a URL (can be relative like '/instrumentation.yaml')
      const url = options.configUrl || options.configPath!
      config = await loadConfig(url)
    }

    // Initialize pattern matcher (if config available)
    if (config) {
      initializePatternMatcher(config)
    }

    // Create OTLP exporter
    const exporterOptions: OtlpExporterOptions = {}
    if (options.otlpEndpoint) {
      exporterOptions.endpoint = options.otlpEndpoint
    }
    if (options.otlpHeaders) {
      exporterOptions.headers = options.otlpHeaders
    }
    const exporter = createOtlpExporter(exporterOptions)

    // Build span processors array
    const spanProcessors = []

    // 1. Pattern-based filtering (if config available)
    if (config) {
      spanProcessors.push(new PatternSpanProcessor())
    }

    // 2. OTLP export (SimpleSpanProcessor for browser - no batching)
    spanProcessors.push(new SimpleSpanProcessor(exporter))

    // Create WebTracerProvider with processors
    // Note: Resource configuration will be handled via environment or programmatically
    const provider = new WebTracerProvider({
      spanProcessors
    })

    // Note: Resource attributes (service name, version) should be set via:
    // 1. OTEL_RESOURCE_ATTRIBUTES environment variable
    // 2. Custom Resource passed to WebTracerProvider
    // 3. Collector configuration
    // For now, serviceName is used primarily for logging/debugging

    // Register the provider
    provider.register({
      contextManager: new ZoneContextManager()
    })

    // Register auto-instrumentations
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
            clearTimingResources: true
          },
          '@opentelemetry/instrumentation-xml-http-request': {
            enabled: options.enableXhr ?? true,
            propagateTraceHeaderCorsUrls: [/.*/]
          }
        })
      ]
    })

    sdkInstance = provider
    return provider
  } catch (error) {
    throw new Error(`Failed to initialize OpenTelemetry SDK: ${error}`)
  }
}

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
}
