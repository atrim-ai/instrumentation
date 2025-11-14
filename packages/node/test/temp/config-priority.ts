
import { initializeInstrumentation } from '@atrim/instrumentation'

// Set environment variable
process.env.OTEL_SERVICE_NAME = 'env-service'

// Explicit config should override
initializeInstrumentation({
  serviceName: 'explicit-service'
}).then(() => {
  console.log('Initialization complete')
})
