/**
 * OpenTelemetry Instrumentation Setup for React Application
 *
 * This module initializes OpenTelemetry for the entire React app.
 * Import and call initializeInstrumentation() in your main.tsx BEFORE rendering React.
 */

import { initializeInstrumentation } from '@atrim/instrument-web'

/**
 * Initialize OpenTelemetry instrumentation
 *
 * Call this function once at application startup, before ReactDOM.render()
 *
 * @returns Promise that resolves when instrumentation is ready
 */
export async function initInstrumentation() {
  const serviceName = import.meta.env.VITE_OTEL_SERVICE_NAME || 'atrim-platform-ui'
  const otlpEndpoint =
    import.meta.env.VITE_OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318/v1/traces'

  console.log('🚀 Initializing OpenTelemetry...')
  console.log(`   Service: ${serviceName}`)
  console.log(`   Endpoint: ${otlpEndpoint}`)

  try {
    await initializeInstrumentation({
      serviceName,
      otlpEndpoint,

      // Enable all auto-instrumentations
      enableDocumentLoad: true,
      enableUserInteraction: true,
      enableFetch: true,
      enableXhr: true,

      // Load pattern-based filtering configuration
      // Served by Vite from public/instrumentation.yaml
      configUrl: '/instrumentation.yaml'

      // For production, you can use a remote config server:
      // configUrl: import.meta.env.VITE_CONFIG_URL || '/instrumentation.yaml'
    })

    console.log('✅ OpenTelemetry ready!')
  } catch (error) {
    console.error('❌ Failed to initialize OpenTelemetry:', error)
    // Continue app startup even if telemetry fails
  }
}
