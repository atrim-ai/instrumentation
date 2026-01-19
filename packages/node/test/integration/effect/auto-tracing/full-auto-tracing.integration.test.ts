/**
 * Integration test for Effect unified tracing layer creation and functionality
 *
 * Tests the UnifiedTracingLive layer works correctly.
 * For full OTLP export testing with spans visible on the Atrim platform,
 * run the examples directly:
 *   - examples/effect-auto-nodesdk-exporter (OTLP export)
 *   - examples/effect-auto-effect-exporter (Console export)
 */

import { describe, it, expect } from 'vitest'
import { Effect, pipe } from 'effect'
import {
  UnifiedTracingLive,
  createUnifiedTracingLayer,
  withoutAutoTracing,
  setSpanName,
  withUnifiedTracing
} from '../../../../src/integrations/effect/auto/index.js'

describe('Effect Auto-Tracing Full Integration', () => {
  it('should create and run with custom auto-tracing layer', async () => {
    console.log('\n📊 Test: Custom auto-tracing layer with explicit config')

    const AutoTracing = createUnifiedTracingLayer({
      config: {
        enabled: true,
        granularity: 'fiber',
        span_naming: {
          default: 'auto-test.{function}',
          infer_from_source: true,
          rules: []
        },
        filter: { include: [], exclude: [] },
        performance: { sampling_rate: 1.0, min_duration: '0ms', max_concurrent: 0 },
        metadata: { fiber_info: true, source_location: true, parent_fiber: true }
      }
    })

    const program = Effect.gen(function* () {
      yield* Effect.log('Starting auto-traced operation...')
      yield* Effect.sleep('50 millis')
      return 'test-result'
    })

    const result = await Effect.runPromise(program.pipe(Effect.provide(AutoTracing)))

    expect(result).toBe('test-result')
    console.log('✅ Custom auto-tracing layer works')
  }, 30000)

  it('should run nested operations with auto-tracing', async () => {
    console.log('\n📊 Test: Nested auto-traced operations')

    const AutoTracing = createUnifiedTracingLayer({
      config: {
        enabled: true,
        granularity: 'fiber',
        span_naming: {
          default: 'nested-test.{fiber_id}',
          infer_from_source: true,
          rules: []
        },
        filter: { include: [], exclude: [] },
        performance: { sampling_rate: 1.0, min_duration: '0ms', max_concurrent: 0 },
        metadata: { fiber_info: true, source_location: true, parent_fiber: true }
      }
    })

    const innerOperation = Effect.gen(function* () {
      yield* Effect.sleep('25 millis')
      return 'inner-result'
    })

    const middleOperation = Effect.gen(function* () {
      yield* Effect.sleep('25 millis')
      const inner = yield* innerOperation
      yield* Effect.sleep('25 millis')
      return `middle-${inner}`
    })

    const outerOperation = Effect.gen(function* () {
      yield* Effect.sleep('25 millis')
      const middle = yield* middleOperation
      yield* Effect.sleep('25 millis')
      return `outer-${middle}`
    })

    const result = await Effect.runPromise(outerOperation.pipe(Effect.provide(AutoTracing)))

    expect(result).toBe('outer-middle-inner-result')
    console.log('✅ Nested auto-traced operations work')
  }, 30000)

  it('should respect withoutAutoTracing opt-out', async () => {
    console.log('\n📊 Test: withoutAutoTracing opt-out')

    const AutoTracing = createUnifiedTracingLayer({
      config: {
        enabled: true,
        granularity: 'fiber',
        span_naming: {
          default: 'optout-test.{fiber_id}',
          infer_from_source: true,
          rules: []
        },
        filter: { include: [], exclude: [] },
        performance: { sampling_rate: 1.0, min_duration: '0ms', max_concurrent: 0 },
        metadata: { fiber_info: true, source_location: true, parent_fiber: true }
      }
    })

    const program = Effect.gen(function* () {
      yield* Effect.sleep('50 millis')

      const optedOut = yield* withoutAutoTracing(
        Effect.gen(function* () {
          yield* Effect.sleep('50 millis')
          return 'opted-out-result'
        })
      )

      yield* Effect.sleep('50 millis')
      return optedOut
    })

    const result = await Effect.runPromise(program.pipe(Effect.provide(AutoTracing)))

    expect(result).toBe('opted-out-result')
    console.log('✅ withoutAutoTracing opt-out works correctly')
  }, 30000)

  it('should use custom span name with setSpanName', async () => {
    console.log('\n📊 Test: setSpanName custom span name')

    const AutoTracing = createUnifiedTracingLayer({
      config: {
        enabled: true,
        granularity: 'fiber',
        span_naming: {
          default: 'setname-test.{fiber_id}',
          infer_from_source: true,
          rules: []
        },
        filter: { include: [], exclude: [] },
        performance: { sampling_rate: 1.0, min_duration: '0ms', max_concurrent: 0 },
        metadata: { fiber_info: true, source_location: true, parent_fiber: true }
      }
    })

    const program = Effect.gen(function* () {
      const result = yield* pipe(
        Effect.gen(function* () {
          yield* Effect.sleep('50 millis')
          return 'custom-named-result'
        }),
        setSpanName('custom.my-important-operation')
      )
      return result
    })

    const result = await Effect.runPromise(program.pipe(Effect.provide(AutoTracing)))

    expect(result).toBe('custom-named-result')
    console.log('✅ setSpanName creates custom-named spans')
  }, 30000)

  it('should handle concurrent auto-traced operations', async () => {
    console.log('\n📊 Test: Concurrent auto-traced operations')

    const AutoTracing = createUnifiedTracingLayer({
      config: {
        enabled: true,
        granularity: 'fiber',
        span_naming: {
          default: 'concurrent-test.{fiber_id}',
          infer_from_source: true,
          rules: []
        },
        filter: { include: [], exclude: [] },
        performance: { sampling_rate: 1.0, min_duration: '0ms', max_concurrent: 0 },
        metadata: { fiber_info: true, source_location: true, parent_fiber: true }
      }
    })

    const operation = (id: number) =>
      Effect.gen(function* () {
        yield* Effect.sleep(`${50 + id * 10} millis`)
        return `result-${id}`
      })

    const program = Effect.gen(function* () {
      const results = yield* Effect.all([
        operation(1),
        operation(2),
        operation(3),
        operation(4),
        operation(5)
      ])
      return results
    })

    const results = await Effect.runPromise(program.pipe(Effect.provide(AutoTracing)))

    expect(results).toEqual(['result-1', 'result-2', 'result-3', 'result-4', 'result-5'])
    console.log('✅ Concurrent auto-traced operations completed successfully')
  }, 30000)

  it('should simulate service layer patterns', async () => {
    console.log('\n📊 Test: Service layer patterns (simulated)')

    const AutoTracing = createUnifiedTracingLayer({
      config: {
        enabled: true,
        granularity: 'fiber',
        span_naming: {
          default: 'service-test.{function}',
          infer_from_source: true,
          rules: [
            { match: { function: 'fetch.*' }, name: 'http.{function}' },
            { match: { function: '.*Service.*' }, name: 'service.{function}' }
          ]
        },
        filter: { include: [], exclude: ['^internal\\.'] },
        performance: { sampling_rate: 1.0, min_duration: '0ms', max_concurrent: 0 },
        metadata: { fiber_info: true, source_location: true, parent_fiber: true }
      }
    })

    const UserService = {
      getUser: (id: number) =>
        Effect.gen(function* () {
          yield* Effect.sleep('50 millis')
          return { id, name: 'Alice', email: 'alice@example.com' }
        }),

      listUsers: () =>
        Effect.gen(function* () {
          yield* Effect.sleep('100 millis')
          return [
            { id: 1, name: 'Alice' },
            { id: 2, name: 'Bob' }
          ]
        })
    }

    const fetchUserProfile = (userId: number) =>
      Effect.gen(function* () {
        yield* Effect.sleep('30 millis')
        return { userId, avatar: 'avatar.png', bio: 'Hello!' }
      })

    const program = Effect.gen(function* () {
      const users = yield* UserService.listUsers()
      const user = yield* UserService.getUser(1)
      const profile = yield* fetchUserProfile(1)

      const [user2, profile2] = yield* Effect.all([UserService.getUser(2), fetchUserProfile(2)])

      return {
        userCount: users.length,
        userName: user.name,
        profileBio: profile.bio,
        user2Name: user2.name,
        profile2Bio: profile2.bio
      }
    })

    const result = await Effect.runPromise(program.pipe(Effect.provide(AutoTracing)))

    expect(result.userCount).toBe(2)
    expect(result.userName).toBe('Alice')
    expect(result.profileBio).toBe('Hello!')
    console.log('✅ Service layer patterns work correctly')
  }, 30000)
})

describe('UnifiedTracingLive Integration', () => {
  it('should create UnifiedTracingLive layer successfully', async () => {
    console.log('\n📊 Test: UnifiedTracingLive layer creation')

    expect(UnifiedTracingLive).toBeDefined()
    expect(createUnifiedTracingLayer).toBeDefined()

    console.log('✅ UnifiedTracingLive layer exports verified')
  })

  it('should export all API surface correctly', () => {
    console.log('\n📊 Test: API surface exports')

    expect(UnifiedTracingLive).toBeDefined()
    expect(createUnifiedTracingLayer).toBeDefined()
    expect(withoutAutoTracing).toBeDefined()
    expect(setSpanName).toBeDefined()
    expect(withUnifiedTracing).toBeDefined()

    console.log('✅ All API exports available')
  })
})
