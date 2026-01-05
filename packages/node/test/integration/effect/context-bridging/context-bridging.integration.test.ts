/**
 * Integration test for Effect-OTel context bridging
 *
 * Tests that Effect spans properly become children of HTTP spans
 * when using withOtelParentSpan utility.
 *
 * This verifies the fix for the issue where Effect spans were creating
 * separate traces instead of continuing the HTTP request trace.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import {
  startCollectorContainer,
  stopCollectorContainer,
  collectorReceivedTraces,
  waitFor,
  getCollectorLogs,
  type CollectorContainer
} from '../../shared/helpers.js'
import express from 'express'
import { Effect, Exit } from 'effect'
import {
  EffectInstrumentationLive,
  withOtelParentSpan
} from '../../../../src/integrations/effect/index.js'
import { initializeInstrumentation } from '../../../../src/api.js'
import type { Server } from 'http'

let collector: CollectorContainer
let server: Server
let port: number

/**
 * Parse span data from collector logs
 * The debug exporter outputs spans in a structured format we can parse
 */
function parseSpansFromLogs(logs: string): Array<{
  name: string
  traceId?: string
  spanId?: string
  parentSpanId?: string
}> {
  const spans: Array<{
    name: string
    traceId?: string
    spanId?: string
    parentSpanId?: string
  }> = []

  // Look for span name patterns in the debug output
  const spanNameRegex = /Name: ([^\n]+)/g
  const traceIdRegex = /TraceId: ([0-9a-f]+)/g
  const spanIdRegex = /SpanId: ([0-9a-f]+)/g
  const parentSpanIdRegex = /ParentSpanId: ([0-9a-f]+)/g

  let match
  let currentSpan: {
    name: string
    traceId?: string
    spanId?: string
    parentSpanId?: string
  } | null = null

  // Parse the logs line by line
  const lines = logs.split('\n')
  for (const line of lines) {
    // Start of a new span
    if (line.includes('Name:')) {
      if (currentSpan) {
        spans.push(currentSpan)
      }
      const nameMatch = /Name: (.+)/.exec(line)
      currentSpan = { name: nameMatch ? nameMatch[1].trim() : '' }
    }

    // TraceId
    if (currentSpan && line.includes('TraceId:')) {
      const traceMatch = /TraceId: ([0-9a-f]+)/.exec(line)
      if (traceMatch) {
        currentSpan.traceId = traceMatch[1]
      }
    }

    // SpanId
    if (currentSpan && line.includes('SpanId:')) {
      const spanMatch = /SpanId: ([0-9a-f]+)/.exec(line)
      if (spanMatch) {
        currentSpan.spanId = spanMatch[1]
      }
    }

    // ParentSpanId
    if (currentSpan && line.includes('ParentSpanId:')) {
      const parentMatch = /ParentSpanId: ([0-9a-f]+)/.exec(line)
      if (parentMatch) {
        currentSpan.parentSpanId = parentMatch[1]
      }
    }
  }

  if (currentSpan) {
    spans.push(currentSpan)
  }

  return spans
}

describe('Effect-OTel Context Bridging Integration', () => {
  beforeAll(async () => {
    // Use random port
    port = 3200 + Math.floor(Math.random() * 1000)

    // Start collector
    collector = await startCollectorContainer()

    // Initialize instrumentation
    await initializeInstrumentation({
      serviceName: 'context-bridging-test',
      otlp: {
        endpoint: `http://localhost:${collector.httpPort}`
      }
    })

    // Create Express app with Effect handlers
    const app = express()

    // Simple Effect operation
    const simpleOperation = Effect.gen(function* () {
      yield* Effect.log('Inside Effect operation')
      yield* Effect.sleep('10 millis')
      return { result: 'success' }
    }).pipe(Effect.withSpan('effect.simpleOp'))

    // Nested Effect operations
    const nestedOperation = Effect.gen(function* () {
      yield* Effect.log('Starting nested operation')

      const step1 = yield* Effect.succeed('step1').pipe(Effect.withSpan('effect.step1'))

      const step2 = yield* Effect.succeed('step2').pipe(Effect.withSpan('effect.step2'))

      return { step1, step2 }
    }).pipe(Effect.withSpan('effect.nestedOp'))

    // Route WITHOUT bridging (control - should create separate trace)
    app.get('/no-bridge', async (_req, res) => {
      const program = simpleOperation.pipe(Effect.provide(EffectInstrumentationLive))

      const exit = await Effect.runPromiseExit(program)

      if (Exit.isSuccess(exit)) {
        res.json(exit.value)
      } else {
        res.status(500).json({ error: 'Failed' })
      }
    })

    // Route WITH bridging (should continue HTTP trace)
    app.get('/with-bridge', async (_req, res) => {
      const program = simpleOperation.pipe(
        withOtelParentSpan, // This bridges HTTP span → Effect spans
        Effect.provide(EffectInstrumentationLive)
      )

      const exit = await Effect.runPromiseExit(program)

      if (Exit.isSuccess(exit)) {
        res.json(exit.value)
      } else {
        res.status(500).json({ error: 'Failed' })
      }
    })

    // Route with nested operations
    app.get('/nested', async (_req, res) => {
      const program = nestedOperation.pipe(
        withOtelParentSpan,
        Effect.provide(EffectInstrumentationLive)
      )

      const exit = await Effect.runPromiseExit(program)

      if (Exit.isSuccess(exit)) {
        res.json(exit.value)
      } else {
        res.status(500).json({ error: 'Failed' })
      }
    })

    server = app.listen(port)
  })

  afterAll(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()))
      // Allow SDK time to flush
      await new Promise((resolve) => setTimeout(resolve, 1000))
    }

    if (collector && !process.env.CI) {
      await stopCollectorContainer(collector)
      console.log('🧹 Cleaned up collector (local dev mode)')
    } else if (collector && process.env.CI) {
      console.log('⏭️  Leaving collector for CI cleanup')
    }
  })

  it('should respond to requests', async () => {
    const response = await fetch(`http://localhost:${port}/with-bridge`)
    expect(response.status).toBe(200)

    const body = await response.json()
    expect(body).toEqual({ result: 'success' })
  })

  it('should send traces to collector', async () => {
    await fetch(`http://localhost:${port}/with-bridge`)
    await new Promise((resolve) => setTimeout(resolve, 2000))

    const receivedTraces = await waitFor(() => collectorReceivedTraces(collector), 10000, 1000)

    expect(receivedTraces).toBeTruthy()
  })

  it('WITH bridging: Effect spans should be children of HTTP span', async () => {
    // Make request with bridging
    await fetch(`http://localhost:${port}/with-bridge`)
    await new Promise((resolve) => setTimeout(resolve, 2000))

    const logs = await getCollectorLogs(collector, 500)
    const spans = parseSpansFromLogs(logs)

    console.log('Parsed spans (with bridging):', spans)

    // Find HTTP span and Effect span
    const httpSpan = spans.find((s) => s.name.includes('GET') || s.name.includes('http'))
    const effectSpan = spans.find((s) => s.name === 'effect.simpleOp')

    expect(httpSpan).toBeDefined()
    expect(effectSpan).toBeDefined()

    if (httpSpan && effectSpan) {
      // Effect span should have the HTTP span as parent
      expect(effectSpan.parentSpanId).toBe(httpSpan.spanId)

      // Both should share the same trace ID
      expect(effectSpan.traceId).toBe(httpSpan.traceId)

      console.log('✅ Verified parent-child relationship:')
      console.log(`   HTTP span: ${httpSpan.name} (${httpSpan.spanId})`)
      console.log(`   Effect span: ${effectSpan.name} (parent: ${effectSpan.parentSpanId})`)
      console.log(`   Shared trace ID: ${httpSpan.traceId}`)
    }
  })

  it('should create proper span hierarchy with nested operations', async () => {
    await fetch(`http://localhost:${port}/nested`)
    await new Promise((resolve) => setTimeout(resolve, 2000))

    const logs = await getCollectorLogs(collector, 500)
    const spans = parseSpansFromLogs(logs)

    console.log('Parsed spans (nested):', spans)

    // Find spans
    const httpSpan = spans.find((s) => s.name.includes('GET') || s.name.includes('http'))
    const nestedOpSpan = spans.find((s) => s.name === 'effect.nestedOp')
    const step1Span = spans.find((s) => s.name === 'effect.step1')
    const step2Span = spans.find((s) => s.name === 'effect.step2')

    expect(httpSpan).toBeDefined()
    expect(nestedOpSpan).toBeDefined()

    if (httpSpan && nestedOpSpan) {
      // All spans should share the same trace ID
      expect(nestedOpSpan.traceId).toBe(httpSpan.traceId)

      if (step1Span && step2Span) {
        expect(step1Span.traceId).toBe(httpSpan.traceId)
        expect(step2Span.traceId).toBe(httpSpan.traceId)

        // Nested op should be child of HTTP span
        expect(nestedOpSpan.parentSpanId).toBe(httpSpan.spanId)

        console.log('✅ Verified nested span hierarchy')
      }
    }
  })
})
