import express from 'express'
import { initializeInstrumentation } from '@atrim/instrument-node'

// Simulate Express + Effect project
// Both express and effect are available

initializeInstrumentation({
  serviceName: 'test-service'
}).then(() => {
  console.log('Initialization complete')
})
