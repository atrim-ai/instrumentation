
import { initializeInstrumentation } from '@atrim/instrumentation'

// Set environment variables
process.env.OTEL_SERVICE_NAME = 'env-service'
process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'http://localhost:14318'

// No explicit config - should use environment
initializeInstrumentation().then(() => {
  console.log('Initialization complete')
})
