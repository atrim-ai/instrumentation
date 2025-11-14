
import { initializeInstrumentation } from '@atrim/instrumentation'

// Explicitly disable auto-instrumentation
initializeInstrumentation({
  serviceName: 'test-service',
  autoInstrument: false
}).then(() => {
  console.log('Initialization complete')
})
