/**
 * Integration test to verify auto-span pipeable operators create proper spans
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
 * Run a simple Effect program that uses auto-span operators
 */
async function runAutoSpanTest(otlpEndpoint: string): Promise<{ stdout: string; stderr: string }> {
  const scriptPath = path.resolve(__dirname, '../../../test-auto-span.ts')

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
    }, 15000)
  })
}

describe('Auto-Span Pipeable Operators Integration', () => {
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

  it('should create spans with auto-span operators', async () => {
    console.log('\n📋 Testing auto-span pipeable operators...\n')

    // Run test program
    const result = await runAutoSpanTest(`http://localhost:${collector.httpPort}`)

    // Verify program ran successfully
    expect(result.stdout).toContain('All auto-span tests completed')

    // Wait for spans to be exported
    await new Promise((resolve) => setTimeout(resolve, 2000))

    // Get collector logs
    const logs = await getCollectorLogs(collector, 500)

    console.log('\n📊 Checking for span names in collector logs...\n')

    // Verify span names are present
    expect(logs).toContain('test.explicit')
    expect(logs).toContain('test.traced')
    expect(logs).toContain('test.withMetadata')
    expect(logs).toContain('app.fetchUsers')
    expect(logs).toContain('app.processData')
    expect(logs).toContain('nested.outer')
    expect(logs).toContain('nested.inner')
    expect(logs).toContain('test.withOptions')

    // Verify Effect metadata is extracted (from traced operator)
    expect(logs).toContain('effect.fiber.id')

    // Verify custom attributes work
    expect(logs).toContain('custom.attr')

    // Verify user annotations work with traced
    expect(logs).toContain('user.id')

    // Verify batch annotations work
    expect(logs).toContain('batch.total_items')

    console.log('✅ All auto-span operators created proper spans!')
  })
})
