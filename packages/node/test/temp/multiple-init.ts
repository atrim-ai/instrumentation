import { initializeInstrumentation } from '@atrim/instrument-node'

// Try to initialize twice
Promise.all([
  initializeInstrumentation({ serviceName: 'service-1' }),
  initializeInstrumentation({ serviceName: 'service-2' })
]).then(([sdk1, sdk2]) => {
  console.log('First SDK:', sdk1 ? 'created' : 'null')
  console.log('Second SDK:', sdk2 ? 'created' : 'null')
  console.log('Same instance:', String(sdk1 === sdk2))
})
