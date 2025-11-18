/**
 * Remote Configuration Example for @atrim/instrumentation
 *
 * This example demonstrates loading instrumentation configuration from a remote URL
 * instead of a local file. This is useful for:
 *
 * - Centralized configuration management
 * - Environment-specific configs (production, staging, dev)
 * - Dynamic config updates without deployments
 * - Multi-service consistency
 *
 * To run this example:
 * 1. Make sure you have an OpenTelemetry collector running:
 *    docker run -p 4318:4318 otel/opentelemetry-collector
 *
 * 2. Run the example (starts both config server and app):
 *    npm start
 *
 * Or run them separately:
 *    Terminal 1: npm run config-server
 *    Terminal 2: npm run app
 */

import { Effect } from 'effect'
import express from 'express'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { trace } from '@opentelemetry/api'
import {
  initializeInstrumentation,
  annotateDbQuery,
  annotateCacheOperation,
  markSpanSuccess,
  markSpanError,
  setSpanAttributes
} from '@atrim/instrument-node'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Get environment from env var (default to 'default')
const ENVIRONMENT = process.env.APP_ENV || 'default'
const CONFIG_SERVER = process.env.CONFIG_SERVER || 'http://localhost:3100'

async function setupInstrumentation() {
  console.log('🚀 Setting up OpenTelemetry with remote configuration...\n')
  console.log(`📡 Environment: ${ENVIRONMENT}`)
  console.log(`📡 Config server: ${CONFIG_SERVER}`)

  // Construct config URL based on environment
  const configUrl =
    ENVIRONMENT === 'default'
      ? `${CONFIG_SERVER}/config/instrumentation.yaml`
      : `${CONFIG_SERVER}/config/${ENVIRONMENT}/instrumentation.yaml`

  console.log(`📡 Loading config from: ${configUrl}\n`)

  try {
    // Load instrumentation config from remote URL
    await Effect.runPromise(
      initializeInstrumentation({
        configUrl,
        cacheTimeout: 300_000, // Cache for 5 minutes
        serviceName: `remote-config-${ENVIRONMENT}`,
        autoInstrument: true // Explicitly enable auto-instrumentation (standard OpenTelemetry app)
      })
    )

    console.log('✅ Remote configuration loaded successfully!\n')
  } catch (error) {
    console.error('❌ Failed to load remote config:', error)
    console.log('⚠️  Falling back to default configuration...\n')

    // Fallback to default config
    await initializeInstrumentation({
      serviceName: `remote-config-${ENVIRONMENT}-fallback`,
      autoInstrument: true
    })
  }
}

// Example business logic functions
async function fetchUserData(userId: string) {
  const tracer = trace.getTracer('remote-config-example')

  return await tracer.startActiveSpan('app.user.fetch', async (span) => {
    try {
      setSpanAttributes(span, {
        'user.id': userId,
        environment: ENVIRONMENT
      })

      await simulateAsync(100)

      await tracer.startActiveSpan('app.db.query', async (dbSpan) => {
        annotateDbQuery(dbSpan, 'postgresql', `SELECT * FROM users WHERE id = '${userId}'`, 'users')
        await simulateAsync(50)
        dbSpan.end()
      })

      markSpanSuccess(span)
      return {
        id: userId,
        name: 'Alice Remote',
        email: 'alice@example.com',
        environment: ENVIRONMENT
      }
    } catch (error) {
      markSpanError(span, 'Failed to fetch user')
      throw error
    } finally {
      span.end()
    }
  })
}

async function storageOperation(key: string, action: 'read' | 'write') {
  const tracer = trace.getTracer('remote-config-example')

  return await tracer.startActiveSpan('storage.operation', async (span) => {
    try {
      setSpanAttributes(span, {
        'storage.key': key,
        'storage.action': action,
        environment: ENVIRONMENT
      })

      await simulateAsync(80)
      markSpanSuccess(span)
    } catch (error) {
      markSpanError(span, 'Storage operation failed')
      throw error
    } finally {
      span.end()
    }
  })
}

async function apiCall(endpoint: string) {
  const tracer = trace.getTracer('remote-config-example')

  return await tracer.startActiveSpan('api.call', async (span) => {
    try {
      setSpanAttributes(span, {
        'api.endpoint': endpoint,
        environment: ENVIRONMENT
      })

      await simulateAsync(120)
      markSpanSuccess(span)
      return { endpoint, status: 200, environment: ENVIRONMENT }
    } catch (error) {
      markSpanError(span, 'API call failed')
      throw error
    } finally {
      span.end()
    }
  })
}

async function debugOperation() {
  // This will be traced in staging/dev but not in production
  const tracer = trace.getTracer('remote-config-example')

  return await tracer.startActiveSpan('debug.operation', async (span) => {
    try {
      setSpanAttributes(span, { environment: ENVIRONMENT })
      await simulateAsync(30)
      span.end()
    } catch (error) {
      span.end()
    }
  })
}

async function internalOperation() {
  // This will always be filtered (all environments)
  const tracer = trace.getTracer('remote-config-example')

  return await tracer.startActiveSpan('internal.utility', async (span) => {
    try {
      await simulateAsync(20)
      span.end()
    } catch (error) {
      span.end()
    }
  })
}

async function demoWorkflow() {
  const tracer = trace.getTracer('remote-config-example')

  return await tracer.startActiveSpan('demo.workflow', async (rootSpan) => {
    try {
      setSpanAttributes(rootSpan, { environment: ENVIRONMENT })

      // Operations that are always traced
      const userData = await fetchUserData('user-789')
      await storageOperation('user:789', 'write')
      const apiResult = await apiCall('/api/users')

      // This may or may not be traced depending on environment
      await debugOperation()

      // This is always filtered
      await internalOperation()

      markSpanSuccess(rootSpan)

      return {
        userData,
        apiResult,
        environment: ENVIRONMENT,
        configSource: 'remote'
      }
    } catch (error) {
      markSpanError(rootSpan, 'Workflow failed')
      throw error
    } finally {
      rootSpan.end()
    }
  })
}

function simulateAsync(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Express app
const app = express()
const PORT = process.env.PORT || 3004

app.get('/', (req, res) => {
  const filePath = path.join(__dirname, 'public', 'index.html')
  res.sendFile(filePath)
})

app.post('/api/workflow', async (req, res) => {
  try {
    const result = await demoWorkflow()
    res.json(result)
  } catch (error) {
    res.status(500).json({ error: 'Workflow failed' })
  }
})

app.get('/api/user/:userId', async (req, res) => {
  try {
    const user = await fetchUserData(req.params.userId)
    res.json(user)
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch user' })
  }
})

app.get('/api/storage/:action', async (req, res) => {
  try {
    await storageOperation('demo-key', req.params.action as 'read' | 'write')
    res.json({ success: true })
  } catch (error) {
    res.status(500).json({ error: 'Storage operation failed' })
  }
})

app.get('/api/external', async (req, res) => {
  try {
    const result = await apiCall('/external/data')
    res.json(result)
  } catch (error) {
    res.status(500).json({ error: 'API call failed' })
  }
})

app.get('/api/debug', async (req, res) => {
  try {
    await debugOperation()
    res.json({ success: true, traced: ENVIRONMENT !== 'production' })
  } catch (error) {
    res.status(500).json({ error: 'Debug operation failed' })
  }
})

app.get('/api/internal', async (req, res) => {
  try {
    await internalOperation()
    res.json({ success: true, traced: false })
  } catch (error) {
    res.status(500).json({ error: 'Internal operation failed' })
  }
})

app.get('/health', (req, res) => {
  res.json({ status: 'ok', environment: ENVIRONMENT })
})

// Main
async function main() {
  console.log('📦 @atrim/instrumentation - Remote Configuration Example\n')
  console.log('='.repeat(60) + '\n')

  try {
    // Setup instrumentation with remote config
    await setupInstrumentation()

    // Start Express server
    app.listen(PORT, () => {
      console.log(`🌐 Application server listening on http://localhost:${PORT}`)
      console.log('\n' + '='.repeat(60))
      console.log('🎨 Interactive UI:')
      console.log(`   👉 Open http://localhost:${PORT} in your browser`)
      console.log('\n📊 Or try these curl requests:')
      console.log(`   curl -X POST http://localhost:${PORT}/api/workflow`)
      console.log(`   curl http://localhost:${PORT}/api/user/user-789`)
      console.log(`   curl http://localhost:${PORT}/api/debug`)
      console.log('\n' + '='.repeat(60))
      console.log('💡 Configuration Details:')
      console.log(`   - Environment: ${ENVIRONMENT}`)
      console.log(`   - Config source: Remote URL`)
      console.log(`   - Config server: ${CONFIG_SERVER}`)
      console.log(`   - Cache timeout: 5 minutes`)
      console.log('\n' + '='.repeat(60))
      console.log('🔄 To change environment:')
      console.log('   APP_ENV=production npm run app')
      console.log('   APP_ENV=staging npm run app')
      console.log('   APP_ENV=development npm run app\n')
    })
  } catch (error) {
    console.error('❌ Fatal error:', error)
    process.exit(1)
  }
}

main()
