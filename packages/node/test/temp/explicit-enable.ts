
import { initializeInstrumentation } from '@atrim/instrumentation'

// Explicitly enable auto-instrumentation
initializeInstrumentation({
  serviceName: 'test-service',
  autoInstrument: true
}).then(() => {
  console.log('Initialization complete')
})
