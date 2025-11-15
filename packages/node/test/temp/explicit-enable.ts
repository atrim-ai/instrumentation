import { initializeInstrumentation } from '@atrim/instrument-node'

// Explicitly enable auto-instrumentation
initializeInstrumentation({
  serviceName: 'test-service',
  autoInstrument: true
}).then(() => {
  console.log('Initialization complete')
})
