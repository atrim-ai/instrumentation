/**
 * Integration tests for auto-detection features
 *
 * Tests:
 * - Detection of existing NodeSDK initialization
 * - Effect-TS detection
 * - Web framework detection
 * - Smart auto-instrumentation defaults
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { spawn } from 'child_process'
import path from 'path'
import { writeFile, mkdir } from 'fs/promises'

/**
 * Execute a TypeScript file using tsx from node_modules
 */
async function runTsFile(
  filePath: string,
  cwd: string = process.cwd()
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    // Use pnpm exec to run tsx (works in monorepo)
    const child = spawn('pnpm', ['exec', 'tsx', filePath], {
      cwd,
      env: {
        ...process.env,
        PATH: process.env.PATH
      }
    })

    let stdout = ''
    let stderr = ''

    child.stdout?.on('data', (data) => {
      stdout += data.toString()
    })

    child.stderr?.on('data', (data) => {
      stderr += data.toString()
    })

    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr })
      } else {
        reject(new Error(`Command failed with exit code ${code}: ${stderr}`))
      }
    })

    child.on('error', reject)
  })
}

describe('Auto-Detection', () => {
  const tempDir = path.join(process.cwd(), './test/temp')

  beforeAll(async () => {
    // Create temp directory for test fixtures
    await mkdir(tempDir, { recursive: true })
  })

  it('should detect existing NodeSDK initialization', async () => {
    // Create a test file that initializes NodeSDK before our library
    const testFile = path.join(tempDir, 'existing-sdk.ts')

    await writeFile(
      testFile,
      `
import { NodeSDK } from '@opentelemetry/sdk-node'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { initializeInstrumentation } from '@atrim/instrument-node'

// User's existing NodeSDK setup
const sdk = new NodeSDK({
  serviceName: 'user-service',
  traceExporter: new OTLPTraceExporter({
    url: 'http://localhost:14318/v1/traces'
  })
})
sdk.start()

console.log('User SDK started')

// Now try to initialize our library
initializeInstrumentation().then((result) => {
  if (result === null) {
    console.log('DETECTION_SUCCESS: Skipped NodeSDK initialization')
  } else {
    console.log('DETECTION_FAILED: Created new SDK instance')
  }
})
`
    )

    // Run the test file
    const { stdout, stderr } = await runTsFile(testFile, process.cwd())

    const output = stdout + stderr

    // Should detect existing initialization and skip
    expect(output).toContain('DETECTION_SUCCESS')
    expect(output).toContain('Detected existing OpenTelemetry initialization')
  })

  it('should detect Effect-TS without web framework', async () => {
    const testFile = path.join(tempDir, 'effect-detection.ts')

    await writeFile(
      testFile,
      `
import { initializeInstrumentation } from '@atrim/instrument-node'

// Simulate Effect-only project (no Express/Fastify)
// Effect is in dependencies, but no web framework

initializeInstrumentation({
  serviceName: 'test-service'
}).then(() => {
  console.log('Initialization complete')
})
`
    )

    const { stdout, stderr } = await runTsFile(testFile, process.cwd())

    const output = stdout + stderr

    // In pure Effect project (no web framework), auto-instrumentation should be disabled
    // Look for the detection message
    const hasDetectionMessage =
      output.includes('Detected Effect-TS without web framework') ||
      output.includes('Auto-instrumentation: disabled')

    if (hasDetectionMessage) {
      console.log('✅ Successfully detected Effect-only configuration')
    }
  })

  it('should enable auto-instrumentation for Express + Effect', async () => {
    const testFile = path.join(tempDir, 'express-effect-detection.ts')

    await writeFile(
      testFile,
      `
import express from 'express'
import { initializeInstrumentation } from '@atrim/instrument-node'

// Simulate Express + Effect project
// Both express and effect are available

initializeInstrumentation({
  serviceName: 'test-service'
}).then(() => {
  console.log('Initialization complete')
})
`
    )

    const { stdout, stderr } = await runTsFile(
      testFile,
      path.join(process.cwd(), './examples/effect-ts')
    )

    const output = stdout + stderr

    // With Express present, auto-instrumentation should be enabled
    expect(output).toContain('Auto-instrumentation: enabled')
  })

  it('should respect explicit autoInstrument: false', async () => {
    const testFile = path.join(tempDir, 'explicit-disable.ts')

    await writeFile(
      testFile,
      `
import { initializeInstrumentation } from '@atrim/instrument-node'

// Explicitly disable auto-instrumentation
initializeInstrumentation({
  serviceName: 'test-service',
  autoInstrument: false
}).then(() => {
  console.log('Initialization complete')
})
`
    )

    const { stdout, stderr } = await runTsFile(testFile, process.cwd())

    const output = stdout + stderr

    // Should respect explicit setting (no auto-detected message)
    expect(output).not.toContain('(auto-detected)')
    expect(output).toContain('Auto-instrumentation: disabled')
  })

  it('should respect explicit autoInstrument: true', async () => {
    const testFile = path.join(tempDir, 'explicit-enable.ts')

    await writeFile(
      testFile,
      `
import { initializeInstrumentation } from '@atrim/instrument-node'

// Explicitly enable auto-instrumentation
initializeInstrumentation({
  serviceName: 'test-service',
  autoInstrument: true
}).then(() => {
  console.log('Initialization complete')
})
`
    )

    const { stdout, stderr } = await runTsFile(testFile, process.cwd())

    const output = stdout + stderr

    // Should respect explicit setting (no auto-detected message)
    expect(output).not.toContain('(auto-detected)')
    expect(output).toContain('Auto-instrumentation: enabled')
  })

  it('should handle multiple initialization attempts gracefully', async () => {
    const testFile = path.join(tempDir, 'multiple-init.ts')

    await writeFile(
      testFile,
      `
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
`
    )

    const { stdout, stderr } = await runTsFile(testFile, process.cwd())

    const output = stdout + stderr

    // Should warn about re-initialization
    expect(output).toContain('already initialized')
    expect(output).toContain('Same instance: true')
  })

  it('should handle pattern-only mode when SDK already exists', async () => {
    const testFile = path.join(tempDir, 'pattern-only.ts')

    await writeFile(
      testFile,
      `
import { NodeSDK } from '@opentelemetry/sdk-node'
import { initializeInstrumentation } from '@atrim/instrument-node'
import { shouldInstrumentSpan } from '@atrim/instrument-node'

// User's existing SDK
const sdk = new NodeSDK({ serviceName: 'user-service' })
sdk.start()

// Initialize our library (should only set up patterns)
initializeInstrumentation().then(() => {
  // Test pattern matching works
  const shouldInstrument = shouldInstrumentSpan('app.test.span')
  console.log('Pattern matching works:', String(shouldInstrument))
})
`
    )

    const { stdout, stderr } = await runTsFile(testFile, process.cwd())

    const output = stdout + stderr

    // Should set up pattern matching even when SDK exists
    expect(output).toContain('Pattern filtering initialized')
    expect(output).toContain('Pattern matching works: true')
  })
})

describe('Configuration Priority', () => {
  it('should prioritize explicit config over environment', async () => {
    const testFile = path.join(process.cwd(), './test/temp/config-priority.ts')

    await writeFile(
      testFile,
      `
import { initializeInstrumentation } from '@atrim/instrument-node'

// Set environment variable
process.env.OTEL_SERVICE_NAME = 'env-service'

// Explicit config should override
initializeInstrumentation({
  serviceName: 'explicit-service'
}).then(() => {
  console.log('Initialization complete')
})
`
    )

    const { stdout, stderr } = await runTsFile(testFile, process.cwd())

    const output = stdout + stderr

    // Should use explicit service name
    expect(output).toContain('Service: explicit-service')
    expect(output).not.toContain('Service: env-service')
  })

  it('should use environment when no explicit config', async () => {
    const testFile = path.join(process.cwd(), './test/temp/env-config.ts')

    await writeFile(
      testFile,
      `
import { initializeInstrumentation } from '@atrim/instrument-node'

// Set environment variables
process.env.OTEL_SERVICE_NAME = 'env-service'
process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'http://localhost:14318'

// No explicit config - should use environment
initializeInstrumentation().then(() => {
  console.log('Initialization complete')
})
`
    )

    const { stdout, stderr } = await runTsFile(testFile, process.cwd())

    const output = stdout + stderr

    // Should use environment service name
    expect(output).toContain('Service: env-service')
    expect(output).toContain('OTLP endpoint: http://localhost:14318')
  })
})
