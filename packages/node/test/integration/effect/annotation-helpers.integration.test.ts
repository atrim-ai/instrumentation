/**
 * Integration test to verify annotation helpers add attributes to spans
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import {
  startCollectorContainer,
  stopCollectorContainer,
  getCollectorLogs,
  type CollectorContainer
} from '../shared/helpers.js'
import { spawn } from 'child_process'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

let collector: CollectorContainer

/**
 * Run a simple Effect program that uses annotation helpers
 */
async function runAnnotationTest(
  otlpEndpoint: string
): Promise<{ stdout: string; stderr: string }> {
  const scriptPath = path.resolve(__dirname, '../../../test-span-attributes.ts')

  return new Promise((resolve, reject) => {
    let stdout = ''
    let stderr = ''

    const child = spawn('pnpm', ['exec', 'tsx', scriptPath], {
      env: {
        ...process.env,
        OTEL_EXPORTER_OTLP_ENDPOINT: otlpEndpoint,
        // Use BatchSpanProcessor with quick export for tests
        OTEL_BSP_SCHEDULE_DELAY: '500'
      }
    })

    child.stdout?.on('data', (data) => {
      stdout += data.toString()
    })

    child.stderr?.on('data', (data) => {
      stderr += data.toString()
    })

    child.on('exit', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr })
      } else {
        reject(new Error(`Test script exited with code ${code}\n${stderr}`))
      }
    })

    child.on('error', (error) => {
      reject(error)
    })

    // Set timeout
    setTimeout(() => {
      child.kill()
      reject(new Error(`Test script timed out`))
    }, 10000)
  })
}

describe('Effect Annotation Helpers Integration', () => {
  beforeAll(async () => {
    // Start isolated collector container
    collector = await startCollectorContainer()
  })

  afterAll(async () => {
    // Cleanup collector
    if (collector && !process.env.CI) {
      await stopCollectorContainer(collector)
      console.log('🧹 Cleaned up collector')
    }
  })

  it('should add Effect metadata attributes to spans', async () => {
    console.log('\n📋 Testing Effect annotation helpers...\n')

    // Run test program
    const result = await runAnnotationTest(`http://localhost:${collector.httpPort}`)

    // Verify program ran successfully
    expect(result.stdout).toContain('All annotations applied')

    // Wait for spans to be exported
    await new Promise((resolve) => setTimeout(resolve, 2000))

    // Get collector logs
    const logs = await getCollectorLogs(collector, 500)

    console.log('\n📊 Checking for annotation attributes in collector logs...\n')

    // Verify Effect metadata attributes
    expect(logs).toContain('effect.fiber.id')
    expect(logs).toContain('effect.fiber.status')
    expect(logs).toContain('effect.operation.nested')
    expect(logs).toContain('effect.operation.root')

    // Verify user context attributes
    expect(logs).toContain('user.id')
    expect(logs).toContain('user.email')
    expect(logs).toContain('user.name')

    // Verify data size attributes
    expect(logs).toContain('data.size.bytes')
    expect(logs).toContain('data.size.items')

    // Verify query attributes
    expect(logs).toContain('db.statement')
    expect(logs).toContain('db.duration.ms')
    expect(logs).toContain('db.row_count')
    expect(logs).toContain('db.name')

    // Verify batch attributes
    expect(logs).toContain('batch.size')
    expect(logs).toContain('batch.total_items')
    expect(logs).toContain('batch.count')

    // Verify priority attributes
    expect(logs).toContain('operation.priority')

    console.log('✅ All annotation attributes found in collector logs!')
  })
})
