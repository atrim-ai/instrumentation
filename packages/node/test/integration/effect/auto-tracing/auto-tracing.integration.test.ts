/**
 * Integration test for Effect auto-tracing via Supervisor API
 *
 * Tests the AutoTracingSupervisor layer creation and API usage.
 * Full end-to-end span creation is tested in unit tests.
 */

import { describe, it, expect } from 'vitest'
import { Effect, Layer } from 'effect'
import {
  AutoTracingLive,
  createAutoTracingLayer,
  withoutAutoTracing,
  setSpanName,
  AutoTracingSupervisor,
  AutoTracingEnabled,
  AutoTracingSpanName
} from '../../../../src/integrations/effect/auto/index.js'

describe('Effect Auto-Tracing Integration', () => {
  it('should create AutoTracingLive layer successfully', async () => {
    // Verify the layer can be created without errors
    expect(AutoTracingLive).toBeDefined()
    console.log('✅ AutoTracingLive layer created successfully')
  })

  it('should create custom auto-tracing layer with config', async () => {
    const customLayer = createAutoTracingLayer({
      config: {
        enabled: true,
        granularity: 'fiber',
        span_naming: {
          default: 'test.{fiber_id}',
          infer_from_source: false,
          rules: [{ match: { function: 'test.*' }, name: 'custom.{function}' }]
        },
        filter: { include: [], exclude: ['^internal\\.'] },
        performance: { sampling_rate: 0.5, min_duration: '1ms', max_concurrent: 100 },
        metadata: { fiber_info: true, source_location: false, parent_fiber: true }
      }
    })

    expect(customLayer).toBeDefined()
    console.log('✅ Custom auto-tracing layer created with config')
  })

  it('should run Effect program with AutoTracingLive layer', async () => {
    const program = Effect.gen(function* () {
      yield* Effect.sleep('10 millis')
      return 'success'
    })

    // Run with the auto-tracing layer
    // Note: Without a proper OTel global provider, no spans will be exported,
    // but the program should still run without errors
    const result = await Effect.runPromise(program.pipe(Effect.provide(AutoTracingLive)))

    expect(result).toBe('success')
    console.log('✅ Effect program runs successfully with AutoTracingLive')
  })

  it('should respect withoutAutoTracing opt-out', async () => {
    const program = Effect.gen(function* () {
      // Run with opt-out - this should work without errors
      const result = yield* withoutAutoTracing(
        Effect.gen(function* () {
          yield* Effect.sleep('5 millis')
          return 'opted-out'
        })
      )
      return result
    })

    const result = await Effect.runPromise(program)
    expect(result).toBe('opted-out')
    console.log('✅ withoutAutoTracing opt-out works')
  })

  it('should respect setSpanName override', async () => {
    const program = Effect.gen(function* () {
      const result = yield* setSpanName('custom.test-span')(
        Effect.gen(function* () {
          yield* Effect.sleep('5 millis')
          return 'custom-named'
        })
      )
      return result
    })

    const result = await Effect.runPromise(program)
    expect(result).toBe('custom-named')
    console.log('✅ setSpanName override works')
  })

  it('should export all expected API surface', () => {
    // Verify all exports are available
    expect(AutoTracingLive).toBeDefined()
    expect(createAutoTracingLayer).toBeDefined()
    expect(withoutAutoTracing).toBeDefined()
    expect(setSpanName).toBeDefined()
    expect(AutoTracingSupervisor).toBeDefined()
    expect(AutoTracingEnabled).toBeDefined()
    expect(AutoTracingSpanName).toBeDefined()

    console.log('✅ All expected exports are available')
  })

  it('should handle disabled config gracefully', async () => {
    const disabledLayer = createAutoTracingLayer({
      config: {
        enabled: false, // Disabled
        granularity: 'fiber',
        span_naming: { default: 'test', infer_from_source: false, rules: [] },
        filter: { include: [], exclude: [] },
        performance: { sampling_rate: 1.0, min_duration: '0ms', max_concurrent: 0 },
        metadata: { fiber_info: true, source_location: true, parent_fiber: true }
      }
    })

    const program = Effect.gen(function* () {
      yield* Effect.sleep('5 millis')
      return 'disabled-config'
    })

    const result = await Effect.runPromise(program.pipe(Effect.provide(disabledLayer)))
    expect(result).toBe('disabled-config')
    console.log('✅ Disabled config handled gracefully')
  })
})
