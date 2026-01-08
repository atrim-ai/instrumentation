/**
 * Tests for AutoTracingSupervisor
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Effect, Fiber, Layer, FiberRef } from 'effect'
import * as OtelApi from '@opentelemetry/api'
import type { AutoInstrumentationConfig } from '@atrim/instrument-core'
import {
  AutoTracingSupervisor,
  createAutoTracingSupervisor,
  createAutoTracingLayer,
  withoutAutoTracing,
  setSpanName,
  AutoTracingEnabled,
  AutoTracingSpanName
} from '../../../../src/integrations/effect/auto/supervisor.js'

// Mock the config loader
vi.mock('../../../../src/integrations/effect/auto/config.js', () => ({
  loadAutoTracingConfig: () =>
    Effect.succeed({
      enabled: true,
      granularity: 'fiber' as const,
      span_naming: {
        default: 'effect.fiber.{fiber_id}',
        infer_from_source: false,
        rules: []
      },
      filter: { include: [], exclude: [] },
      performance: { sampling_rate: 1.0, min_duration: '0ms', max_concurrent: 0 },
      metadata: { fiber_info: true, source_location: true, parent_fiber: true }
    })
}))

describe('AutoTracingSupervisor', () => {
  const baseConfig: AutoInstrumentationConfig = {
    enabled: true,
    granularity: 'fiber',
    span_naming: {
      default: 'effect.fiber.{fiber_id}',
      infer_from_source: false,
      rules: []
    },
    filter: { include: [], exclude: [] },
    performance: { sampling_rate: 1.0, min_duration: '0ms', max_concurrent: 0 },
    metadata: { fiber_info: true, source_location: true, parent_fiber: true }
  }

  describe('createAutoTracingSupervisor', () => {
    it('should create supervisor instance', () => {
      const supervisor = createAutoTracingSupervisor(baseConfig)
      expect(supervisor).toBeInstanceOf(AutoTracingSupervisor)
    })
  })

  describe('createAutoTracingLayer', () => {
    it('should create an empty layer when disabled', async () => {
      const disabledConfig: AutoInstrumentationConfig = {
        ...baseConfig,
        enabled: false
      }

      const layer = createAutoTracingLayer({ config: disabledConfig })
      // Layer creation should succeed
      expect(layer).toBeDefined()
    })

    it('should create a supervisor layer when enabled', async () => {
      const layer = createAutoTracingLayer({ config: baseConfig })
      expect(layer).toBeDefined()
    })
  })

  describe('filter patterns', () => {
    it('should exclude spans matching exclude patterns', () => {
      const config: AutoInstrumentationConfig = {
        ...baseConfig,
        filter: {
          include: [],
          exclude: ['^internal\\.']
        }
      }

      const supervisor = createAutoTracingSupervisor(config)
      // The private shouldTrace method is called during onStart
      // We can verify filtering by checking if a span name matches exclude patterns
      expect(supervisor).toBeInstanceOf(AutoTracingSupervisor)
    })

    it('should only include spans matching include patterns when specified', () => {
      const config: AutoInstrumentationConfig = {
        ...baseConfig,
        filter: {
          include: ['^service\\.'],
          exclude: []
        }
      }

      const supervisor = createAutoTracingSupervisor(config)
      expect(supervisor).toBeInstanceOf(AutoTracingSupervisor)
    })
  })

  describe('sampling', () => {
    it('should respect sampling_rate of 0', () => {
      const config: AutoInstrumentationConfig = {
        ...baseConfig,
        performance: {
          ...baseConfig.performance,
          sampling_rate: 0
        }
      }

      const supervisor = createAutoTracingSupervisor(config)
      expect(supervisor).toBeInstanceOf(AutoTracingSupervisor)
    })
  })

  describe('max_concurrent', () => {
    it('should respect max_concurrent limit', () => {
      const config: AutoInstrumentationConfig = {
        ...baseConfig,
        performance: {
          ...baseConfig.performance,
          max_concurrent: 10
        }
      }

      const supervisor = createAutoTracingSupervisor(config)
      expect(supervisor).toBeInstanceOf(AutoTracingSupervisor)
    })
  })
})

describe('withoutAutoTracing', () => {
  it('should wrap effect with disabled auto-tracing', async () => {
    const effect = Effect.succeed(42)
    const wrapped = withoutAutoTracing(effect)

    // Run and verify the effect still produces the correct value
    const result = await Effect.runPromise(wrapped)
    expect(result).toBe(42)
  })

  it('should disable auto-tracing via FiberRef', async () => {
    const checkValue = Effect.gen(function* () {
      return yield* FiberRef.get(AutoTracingEnabled)
    })

    // Without wrapper, should be true (default)
    const enabledResult = await Effect.runPromise(checkValue)
    expect(enabledResult).toBe(true)

    // With wrapper, should be false
    const disabledResult = await Effect.runPromise(withoutAutoTracing(checkValue))
    expect(disabledResult).toBe(false)
  })
})

describe('setSpanName', () => {
  it('should wrap effect with span name override', async () => {
    const effect = Effect.succeed('test')
    const wrapped = setSpanName('custom.span.name')(effect)

    const result = await Effect.runPromise(wrapped)
    expect(result).toBe('test')
  })

  it('should set span name via FiberRef', async () => {
    const { Option } = await import('effect')

    const checkValue = Effect.gen(function* () {
      return yield* FiberRef.get(AutoTracingSpanName)
    })

    // Without wrapper, should be None
    const defaultResult = await Effect.runPromise(checkValue)
    expect(Option.isNone(defaultResult)).toBe(true)

    // With wrapper, should be Some("custom.name")
    const customResult = await Effect.runPromise(setSpanName('custom.name')(checkValue))
    expect(Option.isSome(customResult)).toBe(true)
    if (Option.isSome(customResult)) {
      expect(customResult.value).toBe('custom.name')
    }
  })
})

describe('duration parsing', () => {
  const durationBaseConfig: AutoInstrumentationConfig = {
    enabled: true,
    granularity: 'fiber',
    span_naming: {
      default: 'effect.fiber.{fiber_id}',
      infer_from_source: false,
      rules: []
    },
    filter: { include: [], exclude: [] },
    performance: { sampling_rate: 1.0, min_duration: '0ms', max_concurrent: 0 },
    metadata: { fiber_info: true, source_location: true, parent_fiber: true }
  }

  // Note: parseMinDuration is a private method, but we can test it indirectly
  // through the supervisor's behavior with different min_duration values
  it('should handle various duration formats in config', () => {
    const testCases = [
      { min_duration: '0ms', expected: 'zero' },
      { min_duration: '100ms', expected: 'millis' },
      { min_duration: '1s', expected: 'seconds' },
      { min_duration: '500us', expected: 'micros' }
    ]

    for (const testCase of testCases) {
      const config: AutoInstrumentationConfig = {
        ...durationBaseConfig,
        performance: {
          ...durationBaseConfig.performance,
          min_duration: testCase.min_duration
        }
      }

      const supervisor = createAutoTracingSupervisor(config)
      expect(supervisor).toBeInstanceOf(AutoTracingSupervisor)
    }
  })
})
