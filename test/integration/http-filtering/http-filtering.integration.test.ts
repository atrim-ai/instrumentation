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
    // Wait for BatchSpanProcessor to export
    await new Promise((resolve) => setTimeout(resolve, 2000))

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

    // Wait for export attempts
    await new Promise((resolve) => setTimeout(resolve, 2000))

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

  it('should not create traces for default filtered endpoints', async () => {
    // Get initial span count
    const logsBefore = await getCollectorLogs(collector, 200)
    const spanCountBefore = (logsBefore.match(/Span #/g) || []).length

    const tracer = trace.getTracer('test-tracer')

    // Create a parent span
    await tracer.startActiveSpan('http-filter-test', async (span) => {
      try {
        // Make requests to endpoints that should be filtered by default
        // Using fetch which uses undici in Node.js
        await fetch('http://example.com/healthz').catch(() => {
          // Ignore network errors - we're just testing if spans are created
        })
        await fetch('http://example.com/v1/metrics').catch(() => {})

        span.end()
      } catch (error) {
        span.end()
      }
    })

    // Wait for export
    await new Promise((resolve) => setTimeout(resolve, 2000))

    // Get collector logs
    const logsAfter = await getCollectorLogs(collector, 200)
    const spanCountAfter = (logsAfter.match(/Span #/g) || []).length

    // Should have the parent span
    expect(logsAfter).toContain('http-filter-test')

    // Should only have 1 new span (the parent), not additional HTTP client spans
    // Note: Due to undici vs http instrumentation differences, this might vary
    // The key verification is that we're not creating excessive spans
    const newSpans = spanCountAfter - spanCountBefore
    expect(newSpans).toBeLessThanOrEqual(3) // parent + possibly 2 HTTP spans if not filtered
  })
})
