/**
 * Test attribute types being sent to OpenTelemetry
 */

import * as OtelApi from '@opentelemetry/api'
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node'
import { SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'

// Setup provider
const provider = new NodeTracerProvider()
const exporter = new OTLPTraceExporter({
  url: 'https://traefik.atrim.io/v1/traces',
  headers: {
    'x-api-key': 'atrim_internal_tenant_000000000002'
  }
})
provider.addSpanProcessor(new SimpleSpanProcessor(exporter))
provider.register()

const tracer = OtelApi.trace.getTracer('attribute-test')

// Create span with numeric attributes
const span = tracer.startSpan('test.span', {
  kind: OtelApi.SpanKind.INTERNAL,
  attributes: {
    'string.value': 'hello',
    'number.value': 42,
    'number.from_parseint': parseInt('123'),
    'number.from_number': Number('456'),
    'number.literal': 789
  }
})

console.log('Created span with attributes:')
console.log('  string.value: "hello" (type: string)')
console.log('  number.value: 42 (type: number)')
console.log('  number.from_parseint:', parseInt('123'), '(type:', typeof parseInt('123'), ')')
console.log('  number.from_number:', Number('456'), '(type:', typeof Number('456'), ')')
console.log('  number.literal: 789 (type: number)')

span.end()

// Wait for export
setTimeout(() => {
  provider.shutdown().then(() => {
    console.log('\nSpan exported - check Atrim UI for attribute types')
    process.exit(0)
  })
}, 1000)
