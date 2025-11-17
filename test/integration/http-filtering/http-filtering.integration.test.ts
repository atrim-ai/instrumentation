/**
 * Integration test for HTTP request filtering
 *
 * Tests:
 * - OTLP endpoint requests are filtered (no trace loops)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import {
  startCollectorContainer,
  stopCollectorContainer,
  getCollectorLogs,
  type CollectorContainer
} from '../shared/helpers.js'
import { initializeInstrumentation } from '../../../src/api.js'
import { trace } from '@opentelemetry/api'

let collector: CollectorContainer

describe('HTTP Request Filtering', () => {
  beforeAll(async () => {
    // Start isolated collector container
    collector = await startCollectorContainer()

    // Initialize instrumentation with HTTP filtering
    await initializeInstrumentation({
      serviceName: 'http-filtering-test',
      serviceVersion: '1.0.0-test',
      otlp: {
        endpoint: `http://localhost:${collector.httpPort}`
      },
      http: {
        // Pattern-based filtering (for future use)
        ignoreOutgoingUrls: [/test-ignored-service/],
        ignoreIncomingPaths: [/^\/health$/, /^\/api\/internal/]
      }
    })

    // Wait for initialization
    await new Promise((resolve) => setTimeout(resolve, 1000))
  })

  afterAll(async () => {
    // Wait for BatchSpanProcessor to export and collector to forward
    // Extra time ensures traces are forwarded to dev instance before cleanup
    await new Promise((resolve) => setTimeout(resolve, 3000))

    // Cleanup collector
    if (collector && !process.env.CI) {
      await stopCollectorContainer(collector)
      console.log('🧹 Cleaned up collector (local dev mode)')
    }
  })

  it('should filter OTLP endpoint requests (no trace loops)', async () => {
    // Get initial span count
    const logsBefore = await getCollectorLogs(collector, 200)
    const spanCountBefore = (logsBefore.match(/Span #/g) || []).length

    // Make multiple requests that will trigger OTLP exports
    const tracer = trace.getTracer('test-tracer')
    for (let i = 0; i < 5; i++) {
      const span = tracer.startSpan(`test-operation-${i}`)
      span.setAttribute('test.iteration', i)
      span.end()
    }

    // Wait for export attempts (longer wait for batch processor)
    await new Promise((resolve) => setTimeout(resolve, 3000))

    // Get collector logs
    const logsAfter = await getCollectorLogs(collector, 200)
    const spanCountAfter = (logsAfter.match(/Span #/g) || []).length

    // Should have received some test-operation spans
    // (exact count may vary due to batching)
    const newSpans = spanCountAfter - spanCountBefore
    expect(newSpans).toBeGreaterThan(0)

    // But should NOT contain HTTP client spans for the OTLP export requests
    // If there were unfiltered HTTP spans for /v1/traces, we'd see many more spans
    // (each test span would create an HTTP span when exporting, creating a loop)
    // With filtering, we should see only the test spans, not double or triple
    expect(newSpans).toBeLessThan(15)

    // Verify at least one test span is present
    const hasTestSpans =
      logsAfter.includes('test-operation-0') ||
      logsAfter.includes('test-operation-1') ||
      logsAfter.includes('test-operation-2')
    expect(hasTestSpans).toBe(true)

    // Verify no HTTP POST spans to /v1/traces are present
    const httpTraceSpans = logsAfter.split('\n').filter((line) => {
      return line.includes('POST') && line.includes('/v1/traces')
    }).length

    expect(httpTraceSpans).toBe(0)
  })
})
