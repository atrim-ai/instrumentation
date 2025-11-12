/**
 * Simple Configuration Server
 *
 * This is a simple HTTP server that serves instrumentation.yaml files.
 * In production, this would be replaced with:
 * - Cloud storage (S3, GCS, Azure Blob)
 * - CDN (CloudFront, Cloudflare)
 * - Configuration management service
 * - Git repository (raw.githubusercontent.com)
 */

import express from 'express'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
const PORT = 3100

// Log all requests
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`)
  next()
})

// Serve YAML config files
app.get('/config/:environment/instrumentation.yaml', (req, res) => {
  const { environment } = req.params
  const configPath = path.join(__dirname, 'configs', environment, 'instrumentation.yaml')

  console.log(`  Serving config for environment: ${environment}`)

  res.setHeader('Content-Type', 'text/yaml')
  res.setHeader('Cache-Control', 'public, max-age=300') // Cache for 5 minutes
  res.sendFile(configPath, (err) => {
    if (err) {
      console.log(`  Config not found: ${configPath}`)
      res.status(404).send('Config not found')
    }
  })
})

// Serve default config
app.get('/config/instrumentation.yaml', (req, res) => {
  const configPath = path.join(__dirname, 'configs', 'default', 'instrumentation.yaml')

  console.log('  Serving default config')

  res.setHeader('Content-Type', 'text/yaml')
  res.setHeader('Cache-Control', 'public, max-age=300')
  res.sendFile(configPath, (err) => {
    if (err) {
      res.status(404).send('Config not found')
    }
  })
})

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'config-server' })
})

// List available configs
app.get('/configs', (req, res) => {
  res.json({
    available: [
      '/config/instrumentation.yaml (default)',
      '/config/production/instrumentation.yaml',
      '/config/staging/instrumentation.yaml',
      '/config/development/instrumentation.yaml'
    ]
  })
})

app.listen(PORT, () => {
  console.log('\n' + '='.repeat(60))
  console.log('📡 Configuration Server Started')
  console.log('='.repeat(60))
  console.log(`🌐 Listening on: http://localhost:${PORT}`)
  console.log('\n📋 Available endpoints:')
  console.log(`   http://localhost:${PORT}/config/instrumentation.yaml`)
  console.log(`   http://localhost:${PORT}/config/production/instrumentation.yaml`)
  console.log(`   http://localhost:${PORT}/config/staging/instrumentation.yaml`)
  console.log(`   http://localhost:${PORT}/config/development/instrumentation.yaml`)
  console.log('\n💡 This server simulates a remote configuration service')
  console.log('='.repeat(60) + '\n')
})
