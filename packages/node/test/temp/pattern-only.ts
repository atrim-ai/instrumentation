import { NodeSDK } from '@opentelemetry/sdk-node'
import { initializeInstrumentation } from '@atrim/instrument-node'
import { shouldInstrumentSpan } from '@atrim/instrument-node'

// User's existing SDK
const sdk = new NodeSDK({ serviceName: 'user-service' })
sdk.start()

// Initialize our library (should only set up patterns)
initializeInstrumentation().then(() => {
  // Test pattern matching works
  const shouldInstrument = shouldInstrumentSpan('app.test.span')
  console.log('Pattern matching works:', String(shouldInstrument))
})
