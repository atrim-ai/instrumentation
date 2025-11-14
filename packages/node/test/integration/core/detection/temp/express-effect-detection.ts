
import express from 'express'
import { initializeInstrumentation } from '@atrim/instrumentation'

// Simulate Express + Effect project
// Both express and effect are available

initializeInstrumentation({
  serviceName: 'test-service'
}).then(() => {
  console.log('Initialization complete')
})
