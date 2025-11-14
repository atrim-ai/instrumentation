
import { NodeSDK } from '@opentelemetry/sdk-node'
import { initializeInstrumentation } from '@atrim/instrumentation'
import { shouldInstrumentSpan } from '@atrim/instrumentation'

// User's existing SDK
const sdk = new NodeSDK({ serviceName: 'user-service' })
sdk.start()

// Initialize our library (should only set up patterns)
initializeInstrumentation().then(() => {
  // Test pattern matching works
  const shouldInstrument = shouldInstrumentSpan('app.test.span')
  console.log('Pattern matching works:', String(shouldInstrument))
})
