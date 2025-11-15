import { NodeSDK } from '@opentelemetry/sdk-node'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { initializeInstrumentation } from '@atrim/instrument-node'

// User's existing NodeSDK setup
const sdk = new NodeSDK({
  serviceName: 'user-service',
  traceExporter: new OTLPTraceExporter({
    url: 'http://localhost:14318/v1/traces'
  })
})
sdk.start()

console.log('User SDK started')

// Now try to initialize our library
initializeInstrumentation().then((result) => {
  if (result === null) {
    console.log('DETECTION_SUCCESS: Skipped NodeSDK initialization')
  } else {
    console.log('DETECTION_FAILED: Created new SDK instance')
  }
})
