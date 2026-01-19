/**
 * Native Source Capture and Unified Tracing Example
 *
 * This example demonstrates @atrim/instrumentation's Unified Tracing:
 *
 * KEY FEATURES:
 * - Automatic span names based on source location - NO wrapper functions needed!
 * - Correct fork span hierarchy (fork spans are parents of forked fiber spans)
 * - Operation tracing (Effect.all, Effect.forEach) with item counts
 * - Auto OTel context bridging
 *
 * Just use standard Effect.fork() and get meaningful spans:
 *   yield* Effect.fork(sendEmail())  // Span: "effect.fork (index.ts:XX)"
 *                                    //   └── "effect.fiber (index.ts:XX)"
 *
 * Expected span names:
 *   - "effect.fork (index.ts:XX)" with child fiber spans
 *   - "effect.all" with item counts
 *   - "effect.fiber (index.ts:XX)" for fiber spans
 */

import { Effect, Console, Fiber } from 'effect'
import { UnifiedTracingLive, flushAndShutdown } from '@atrim/instrument-node/effect/auto'

// ============================================================================
// Application Code - Notice: NO tracing boilerplate or special wrappers!
// ============================================================================

/**
 * Simulates sending an email - just regular Effect code
 */
const sendEmail = (to: string, subject: string) =>
  Effect.gen(function* () {
    yield* Console.log(`Sending email to ${to}: "${subject}"`)
    yield* Effect.sleep('100 millis') // Simulate network latency
    yield* Console.log(`Email sent to ${to}!`)
    return { success: true, recipient: to }
  })

/**
 * Simulates processing an order - just regular Effect code
 */
const processOrder = (orderId: string) =>
  Effect.gen(function* () {
    yield* Console.log(`Processing order ${orderId}...`)
    yield* Effect.sleep('200 millis') // Simulate database work
    yield* Console.log(`Order ${orderId} processed!`)
    return { orderId, status: 'processed' }
  })

/**
 * Simulates background analytics - just regular Effect code
 */
const trackAnalytics = (event: string, data: Record<string, unknown>) =>
  Effect.gen(function* () {
    yield* Console.log(`Tracking event: ${event}`)
    yield* Effect.sleep('50 millis')
    return { tracked: true, event }
  })

// ============================================================================
// Main Program - Demonstrates native source capture in action
// ============================================================================

const main = Effect.gen(function* () {
  yield* Console.log('='.repeat(60))
  yield* Console.log('POC: Native Source Capture in Effect Runtime')
  yield* Console.log('='.repeat(60))
  yield* Console.log('')

  yield* Console.log('Starting operations with Effect.fork() (no wrappers needed!)...')
  yield* Console.log('')

  // Fork several fibers using STANDARD Effect.fork()
  // The key insight: With native source capture, these will get meaningful span names!
  //
  // Expected span names (captured from this file's call sites):
  //   - "effect.sendEmail (index.ts:XX)"
  //   - "effect.processOrder (index.ts:XX)"
  //   - "effect.trackAnalytics (index.ts:XX)"

  // Fork email sending (line ~75 - captured automatically!)
  const emailFiber = yield* Effect.fork(sendEmail('alice@example.com', 'Order Confirmation'))

  // Fork order processing (line ~78 - captured automatically!)
  const orderFiber = yield* Effect.fork(processOrder('ORD-12345'))

  // Fork analytics tracking (line ~81 - captured automatically!)
  const analyticsFiber = yield* Effect.fork(trackAnalytics('page_view', { page: '/checkout' }))

  yield* Console.log('All fibers forked! Waiting for completion...')
  yield* Console.log('')

  // Wait for all to complete
  const [emailResult, orderResult, analyticsResult] = yield* Effect.all([
    Fiber.join(emailFiber),
    Fiber.join(orderFiber),
    Fiber.join(analyticsFiber)
  ])

  yield* Console.log('')
  yield* Console.log('='.repeat(60))
  yield* Console.log('Results:')
  yield* Console.log(`  Email: ${JSON.stringify(emailResult)}`)
  yield* Console.log(`  Order: ${JSON.stringify(orderResult)}`)
  yield* Console.log(`  Analytics: ${JSON.stringify(analyticsResult)}`)
  yield* Console.log('='.repeat(60))
  yield* Console.log('')

  yield* Console.log('Check the console output above for span names.')
  yield* Console.log('With native source capture enabled, you should see:')
  yield* Console.log('  - Span names like "effect.sendEmail (index.ts:75)"')
  yield* Console.log('  - code.filepath, code.lineno, code.function attributes')
  yield* Console.log('  - NO "anonymous" or "fiber-XXX" span names!')
  yield* Console.log('')

  // Allow batch processor to flush spans to Atrim backend
  yield* Console.log('Waiting for spans to export to Atrim backend...')
  yield* Effect.sleep('2 seconds')
  yield* Console.log('Done! Check Atrim platform for traces.')
})

// ============================================================================
// Run with UnifiedTracingLive - the recommended layer for Effect tracing
// ============================================================================

console.log('')
console.log('Starting with UnifiedTracingLive...')
console.log('(This layer provides source capture + operation tracing + fiber tracing)')
console.log('')

// Run with UnifiedTracingLive
// Effect.withSpan() creates a root span, forked fibers will be children of fork spans
Effect.runPromise(main.pipe(Effect.withSpan('unified.main'), Effect.provide(UnifiedTracingLive)))
  .then(async () => {
    console.log('')
    console.log('POC completed successfully!')
    console.log('Flushing spans before exit...')
    await flushAndShutdown()
    process.exit(0)
  })
  .catch(async (error) => {
    console.error('POC failed:', error)
    await flushAndShutdown()
    process.exit(1)
  })
