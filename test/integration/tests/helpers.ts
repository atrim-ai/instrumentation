/**
 * Test helpers for integration tests
 */

import { exec, spawn, ChildProcess } from 'child_process'
import { promisify } from 'util'
import { setTimeout } from 'timers/promises'

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
    await execAsync('docker-compose -f test/integration/docker-compose.yml down -v').catch(() => {})

    // Start collector
    await execAsync('docker-compose -f test/integration/docker-compose.yml up -d')

    // Wait for health check
    let attempts = 0
    while (attempts < 30) {
      try {
        const { stdout } = await execAsync(
          'docker exec atrim-otel-collector-test wget --spider -q http://localhost:13133/ 2>&1'
        )
        if (stdout === '' || stdout.includes('200')) {
          console.log('✅ Collector is ready')
          // Give it a moment to fully initialize
          await setTimeout(2000)
          return
        }
      } catch {
        // Health check not ready yet
      }
      attempts++
      await setTimeout(1000)
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
    await execAsync('docker-compose -f test/integration/docker-compose.yml down -v')
    console.log('✅ Collector stopped')
  } catch (error) {
    console.error('⚠️  Error stopping collector:', error)
  }
}

/**
 * Get collector logs
 */
export async function getCollectorLogs(lines: number = 100): Promise<string> {
  try {
    const { stdout } = await execAsync(`docker logs atrim-otel-collector-test 2>&1 | tail -${lines}`)
    return stdout
  } catch (error) {
    return 'Failed to get logs'
  }
}

/**
 * Check if collector received traces
 */
export async function collectorReceivedTraces(): Promise<boolean> {
  const logs = await getCollectorLogs(200)

  // Look for trace data in debug exporter output
  const hasTraces =
    logs.includes('Span') ||
    logs.includes('TracesData') ||
    logs.includes('ResourceSpans') ||
    logs.includes('ScopeSpans')

  return hasTraces
}

/**
 * Clear collector logs
 */
export async function clearCollectorLogs(): Promise<void> {
  try {
    await execAsync('docker logs atrim-otel-collector-test 2>&1 | tail -0')
  } catch {
    // Ignore errors
  }
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
    await setTimeout(interval)
  }

  return false
}
