/**
 * Application Entry Point
 *
 * IMPORTANT: Initialize OpenTelemetry BEFORE rendering React
 */

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { initInstrumentation } from './instrumentation/init'

// Initialize OpenTelemetry first
initInstrumentation()
  .then(() => {
    console.log('✅ Starting React application...')

    // Render React app
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <App />
      </StrictMode>
    )
  })
  .catch((error) => {
    console.error('❌ Failed to initialize:', error)

    // Still render the app even if telemetry fails
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <App />
      </StrictMode>
    )
  })
