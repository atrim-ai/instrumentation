
import { initializeInstrumentation } from '@atrim/instrumentation'

// Simulate Effect-only project (no Express/Fastify)
// Effect is in dependencies, but no web framework

initializeInstrumentation({
  serviceName: 'test-service'
}).then(() => {
  console.log('Initialization complete')
})
