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
    // Enable HTTP filtering debug logging
    process.env.ATRIM_DEBUG_HTTP_FILTERING = 'true'

    // Start isolated collector container
    collector = await startCollectorContainer()

    console.log(`🔧 Collector endpoint: http://localhost:${collector.httpPort}`)

    // Initialize instrumentation with HTTP filtering
    await initializeInstrumentation({
      serviceName: 'http-filtering-test',
      serviceVersion: '1.0.0-test',
      otlp: {
        endpoint: `http://localhost:${collector.httpPort}`
      },
      http: {
        // Explicitly configure patterns to filter OTLP endpoints
        // (NO defaults are applied automatically)
        ignoreOutgoingUrls: [
          /\/v1\/traces$/,
          /\/v1\/metrics$/,
          /\/v1\/logs$/,
          /\/health$/,
          /\/healthz$/
        ],
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

    // CRITICAL: Verify no HTTP client spans to /v1/traces are present
    // Parse the collector logs to find all span names and attributes
    const lines = logsAfter.split('\n')

    // Extract all span names
    const spanNames: string[] = []
    lines.forEach((line) => {
      const nameMatch = line.match(/Name\s+:\s+(.+)/)
      if (nameMatch) {
        spanNames.push(nameMatch[1].trim())
      }
    })

    console.log('📋 All span names found:', spanNames)

    // Check for HTTP client spans to OTLP endpoint
    // Look for span names like "POST", "HTTP POST", etc.
    const httpSpanNames = spanNames.filter(
      (name) =>
        name === 'POST' || name === 'HTTP POST' || name.includes('POST') || name.includes('HTTP')
    )

    console.log('🌐 HTTP span names:', httpSpanNames)

    // Check for URL attributes pointing to /v1/traces
    const tracesUrlLines = lines.filter(
      (line) =>
        (line.includes('url.full') ||
          line.includes('url.path') ||
          line.includes('http.url') ||
          line.includes('http.target')) &&
        (line.includes('/v1/traces') || line.includes(`${collector.httpPort}/v1/traces`))
    )

    if (tracesUrlLines.length > 0) {
      console.error('❌ Found URL attributes pointing to /v1/traces:')
      tracesUrlLines.forEach((line) => console.error('  ', line.trim()))
    }

    // The critical assertion: NO HTTP spans to /v1/traces should exist
    // If we find HTTP span names AND they have /v1/traces URLs, filtering failed
    expect(tracesUrlLines.length).toBe(0)
  })
})
