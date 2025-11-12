/**
 * Test helpers for integration tests
 */

import { exec, spawn, ChildProcess } from 'child_process'
import { promisify } from 'util'
import { setTimeout as sleep } from 'timers/promises'

const execAsync = promisify(exec)

export interface TestServer {
  process: ChildProcess
  port: number
  name: string
}

/**
 * Start the OTEL collector
 */
export async function startCollector(): Promise<void> {
  console.log('🚀 Starting OTEL Collector...')

  try {
    // Stop any existing collector
    await execAsync('docker-compose -f docker-compose.yml down -v').catch(() => {})

    // Start collector
    await execAsync('docker-compose -f docker-compose.yml up -d')

    // Wait for health check - test from host using exposed port 14133
    let attempts = 0
    while (attempts < 30) {
      try {
        const response = await fetch('http://localhost:14133/')
        if (response.ok) {
          console.log('✅ Collector is ready')
          // Give it a moment to fully initialize
          await sleep(2000)
          return
        }
      } catch {
        // Health check not ready yet
      }
      attempts++
      await sleep(1000)
    }

    throw new Error('Collector failed to become healthy')
  } catch (error) {
    console.error('❌ Failed to start collector:', error)
    throw error
  }
}

/**
 * Stop the OTEL collector
 */
export async function stopCollector(): Promise<void> {
  console.log('🛑 Stopping OTEL Collector...')
  try {
    await execAsync('docker-compose -f docker-compose.yml down -v')
    console.log('✅ Collector stopped')
  } catch (error) {
    console.error('⚠️  Error stopping collector:', error)
  }
}

/**
 * Get collector logs
 * If clearCollectorLogs was called, only returns logs after that timestamp
 */
export async function getCollectorLogs(lines: number = 1000): Promise<string> {
  try {
    const { stdout } = await execAsync(`docker logs atrim-otel-collector-test 2>&1 | tail -${lines}`)

    // If we have a clear timestamp, filter logs to only those after it
    if (logClearTimestamp) {
      const logLines = stdout.split('\n')
      const filteredLines: string[] = []
      let foundStartMarker = false

      for (const line of logLines) {
        // Look for timestamp in line (format: 2025-11-12 01:05:24.285Z or similar)
        const timestampMatch = line.match(/(\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?)/)
        if (timestampMatch) {
          const lineTimestamp = new Date(timestampMatch[1])
          if (lineTimestamp >= logClearTimestamp) {
            foundStartMarker = true
          }
        }

        if (foundStartMarker) {
          filteredLines.push(line)
        }
      }

      return filteredLines.join('\n')
    }

    return stdout
  } catch (error) {
    return 'Failed to get logs'
  }
}

/**
 * Check if collector received traces (after last clearCollectorLogs call)
 */
export async function collectorReceivedTraces(): Promise<boolean> {
  const logs = await getCollectorLogs()

  // Look for trace data in debug exporter output
  const hasTraces =
    logs.includes('Span') ||
    logs.includes('TracesData') ||
    logs.includes('ResourceSpans') ||
    logs.includes('ScopeSpans')

  return hasTraces
}

/**
 * Track when logs were last "cleared" (timestamp marker)
 */
let logClearTimestamp: Date | null = null

/**
 * Clear collector logs (sets a timestamp marker)
 */
export async function clearCollectorLogs(): Promise<void> {
  logClearTimestamp = new Date()
  // Give the timestamp a moment to settle
  await sleep(100)
}

/**
 * Start an example server
 */
export async function startExample(
  name: string,
  dir: string,
  port: number
): Promise<TestServer> {
  console.log(`🚀 Starting ${name} on port ${port}...`)

  return new Promise((resolve, reject) => {
    // Start the server
    const serverProcess = spawn('pnpm', ['start'], {
      cwd: dir,
      env: {
        ...process.env,
        PORT: String(port),
        OTEL_EXPORTER_OTLP_ENDPOINT: 'http://localhost:14318'
      },
      stdio: ['ignore', 'pipe', 'pipe']
    })

    let output = ''
    let errorOutput = ''

    serverProcess.stdout?.on('data', (data) => {
      output += data.toString()
    })

    serverProcess.stderr?.on('data', (data) => {
      errorOutput += data.toString()
    })

    serverProcess.on('error', (error) => {
      console.error(`❌ Failed to start ${name}:`, error)
      reject(error)
    })

    // Wait for server to be ready
    const checkInterval = setInterval(async () => {
      try {
        const response = await fetch(`http://localhost:${port}/health`)
        if (response.ok) {
          clearInterval(checkInterval)
          console.log(`✅ ${name} is ready`)
          resolve({
            process: serverProcess,
            port,
            name
          })
        }
      } catch {
        // Server not ready yet
      }
    }, 500)

    // Timeout after 30 seconds
    setTimeout(() => {
      clearInterval(checkInterval)
      serverProcess.kill()
      console.error(`❌ ${name} failed to start within 30s`)
      console.error('Output:', output)
      console.error('Errors:', errorOutput)
      reject(new Error(`${name} failed to start`))
    }, 30000)
  })
}

/**
 * Stop a test server
 */
export async function stopServer(server: TestServer): Promise<void> {
  console.log(`🛑 Stopping ${server.name}...`)

  return new Promise((resolve) => {
    server.process.once('exit', () => {
      console.log(`✅ ${server.name} stopped`)
      resolve()
    })

    server.process.kill('SIGTERM')

    // Force kill after 5 seconds
    setTimeout(() => {
      if (!server.process.killed) {
        console.log(`⚠️  Force killing ${server.name}`)
        server.process.kill('SIGKILL')
      }
      resolve()
    }, 5000)
  })
}

/**
 * Wait for a condition with timeout
 */
export async function waitFor(
  condition: () => Promise<boolean>,
  timeout: number = 10000,
  interval: number = 500
): Promise<boolean> {
  const start = Date.now()

  while (Date.now() - start < timeout) {
    if (await condition()) {
      return true
    }
    await sleep(interval)
  }

  return false
}
