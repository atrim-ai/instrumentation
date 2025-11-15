import { initializeInstrumentation } from '@atrim/instrument-node'

// Explicitly disable auto-instrumentation
initializeInstrumentation({
  serviceName: 'test-service',
  autoInstrument: false
}).then(() => {
  console.log('Initialization complete')
})
