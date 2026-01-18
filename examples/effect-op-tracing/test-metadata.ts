/**
 * Simple test to check if Effect.all/forEach have metadata in trace field
 */

import { Effect } from 'effect'

console.log('Testing if OperationMeta is present in Effect operations...\n')

// Test Effect.all
const allEffect = Effect.all([Effect.succeed(1), Effect.succeed(2), Effect.succeed(3)])

const allTrace = (allEffect as any).trace
console.log('Effect.all trace field:', allTrace)
console.log('Has _tag?', allTrace?._tag)
console.log('Has op?', allTrace?.op)
console.log('Has count?', allTrace?.count)
console.log('')

// Test Effect.forEach
const forEachEffect = Effect.forEach([1, 2, 3], (n) => Effect.succeed(n * 2))

const forEachTrace = (forEachEffect as any).trace
console.log('Effect.forEach trace field:', forEachTrace)
console.log('Has _tag?', forEachTrace?._tag)
console.log('Has op?', forEachTrace?.op)
console.log('Has count?', forEachTrace?.count)
