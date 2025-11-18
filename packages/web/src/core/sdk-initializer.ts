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

  /**
   * Control trace context propagation for cross-origin requests
   *
   * Determines which cross-origin requests receive W3C Trace Context headers
   * (traceparent, tracestate). Note: Backends must allow these headers in CORS
   * configuration or requests will fail with CORS errors.
   *
   * - 'all': Propagate to all cross-origin requests (may cause CORS errors)
   * - 'none': Never propagate trace headers
   * - 'same-origin': Only propagate to same-origin requests (default)
   * - Array of URL patterns: Custom propagation patterns (regex strings)
   *
   * @default 'same-origin'
   *
   * @example Propagate to specific API domains
   * ```typescript
   * propagateTraceContext: ['^https://api\\.myapp\\.com', '^http://localhost:300[0-9]']
   * ```
   *
   * @example Disable propagation (for debugging CORS issues)
   * ```typescript
   * propagateTraceContext: 'none'
   * ```
   */
  propagateTraceContext?: 'all' | 'none' | 'same-origin' | string[]
}

// Singleton instance
let sdkInstance: WebTracerProvider | null = null

/**
 * Build trace context propagation URL patterns
 *
 * Determines which cross-origin requests should receive W3C Trace Context headers.
 * Priority order:
 * 1. API option (options.propagateTraceContext)
 * 2. YAML config (config.http.propagate_trace_context)
 * 3. Default ('same-origin')
 *
 * @param options - SDK initialization options
 * @param config - Loaded instrumentation config
 * @returns Array of RegExp patterns for trace propagation
 */
function buildPropagateTraceUrls(
  options: SdkInitializationOptions,
  config: InstrumentationConfig | null
): RegExp[] {
  // Priority 1: API option
  const apiOption = options.propagateTraceContext

  // Priority 2: YAML config
  const yamlStrategy = config?.http?.propagate_trace_context?.strategy
  const yamlIncludeUrls = config?.http?.propagate_trace_context?.include_urls

  // Determine effective strategy
  let effectiveStrategy: 'all' | 'none' | 'same-origin' | 'patterns'
  let patterns: string[] = []

  if (apiOption !== undefined) {
    // API option takes precedence
    if (typeof apiOption === 'string') {
      effectiveStrategy = apiOption
    } else {
      // Array of patterns
      effectiveStrategy = 'patterns'
      patterns = apiOption
    }
  } else if (yamlStrategy) {
    // Use YAML config
    effectiveStrategy = yamlStrategy
    if (effectiveStrategy === 'patterns' && yamlIncludeUrls) {
      patterns = yamlIncludeUrls
    }
  } else {
    // Default to same-origin only
    effectiveStrategy = 'same-origin'
  }

  // Convert strategy to RegExp array
  switch (effectiveStrategy) {
    case 'all':
      // Propagate to all CORS requests
      return [/.*/]

    case 'none':
    case 'same-origin':
      // No CORS propagation (same-origin requests get headers automatically)
      return []

    case 'patterns': {
      // Convert patterns to RegExp
      const regexes: RegExp[] = []
      for (const pattern of patterns) {
        try {
          regexes.push(new RegExp(pattern))
        } catch (error) {
          console.warn(
            `[@atrim/instrument-web] Invalid trace propagation pattern: "${pattern}"`,
            error
          )
        }
      }
      return regexes
    }

    default:
      // Fallback to same-origin (safe default)
      console.warn(
        `[@atrim/instrument-web] Unknown trace propagation strategy: "${effectiveStrategy}". ` +
          'Defaulting to same-origin only.'
      )
      return []
  }
}

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

    // Build HTTP URL ignore patterns for fetch instrumentation
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

    // Build trace context propagation patterns
    // Note: propagateTraceHeaderCorsUrls controls which CORS requests get trace headers
    // Same-origin requests ALWAYS get trace headers regardless of this setting
    const propagateTraceUrls: RegExp[] = buildPropagateTraceUrls(options, config)

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
            propagateTraceHeaderCorsUrls: propagateTraceUrls, // Controlled by config/API
            clearTimingResources: true,
            ignoreUrls // Prevent self-instrumentation of OTLP exports
          },
          '@opentelemetry/instrumentation-xml-http-request': {
            enabled: options.enableXhr ?? true,
            propagateTraceHeaderCorsUrls: propagateTraceUrls // Controlled by config/API
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
