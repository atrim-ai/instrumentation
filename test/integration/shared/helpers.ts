/**
 * Test helpers for integration tests
 */

import { exec, spawn, ChildProcess } from 'child_process'
import { promisify } from 'util'
import { setTimeout as sleep } from 'timers/promises'
import { GenericContainer, StartedTestContainer, Wait, TestContainers } from 'testcontainers'
import path from 'path'
import { fileURLToPath } from 'url'

const execAsync = promisify(exec)

// ES module __dirname equivalent
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export interface TestServer {
  process: ChildProcess
  port: number
  name: string
}

export interface CollectorContainer {
  container: StartedTestContainer
  httpPort: number
  grpcPort: number
  healthPort: number
}

/**
 * Start an isolated OTEL collector container using testcontainers
 *
 * Traces are forwarded to both:
 * 1. Debug exporter (for test logs)
 * 2. Dev instance at localhost:4318 (for inspection in your local collector) - if available
 */
export async function startCollectorContainer(): Promise<CollectorContainer> {
  console.log('🚀 Starting isolated OTEL Collector container...')

  // Try to enable dev collector forwarding, but don't fail if unavailable
  let devForwardingEnabled = false
  try {
    await TestContainers.exposeHostPorts(4318)
    devForwardingEnabled = true
    console.log('📤 Traces will be forwarded to host.testcontainers.internal:4318 for inspection')
  } catch (error) {
    console.log('⚠️  Dev collector forwarding disabled (port 4318 unavailable or already exposed)')
  }

  try {
    const configPath = devForwardingEnabled
      ? path.join(__dirname, '..', 'otel-collector-config.yaml')
      : path.join(__dirname, '..', 'otel-collector-config-no-forward.yaml')

    const container = await new GenericContainer('otel/opentelemetry-collector:latest')
      .withCommand(['--config=/etc/otel-collector-config.yaml'])
      .withBindMounts([
        {
          source: configPath,
          target: '/etc/otel-collector-config.yaml',
          mode: 'ro'
        }
      ])
      .withExposedPorts(4318, 4317, 13133)
      .withWaitStrategy(Wait.forHttp('/', 13133))
      .withStartupTimeout(30000)
      .start()

    const httpPort = container.getMappedPort(4318)
    const grpcPort = container.getMappedPort(4317)
    const healthPort = container.getMappedPort(13133)

    console.log(`✅ Collector ready - HTTP: ${httpPort}, gRPC: ${grpcPort}, Health: ${healthPort}`)

    // Give it a moment to fully initialize
    await sleep(1000)

    return {
      container,
      httpPort,
      grpcPort,
      healthPort
    }
  } catch (error) {
    console.error('❌ Failed to start collector container:', error)
    throw error
  }
}

/**
 * Stop an OTEL collector container
 */
export async function stopCollectorContainer(collector: CollectorContainer): Promise<void> {
  console.log('🛑 Stopping OTEL Collector container...')
  try {
    await collector.container.stop()
    console.log('✅ Collector container stopped')
  } catch (error) {
    console.error('⚠️  Error stopping collector container:', error)
  }
}

/**
 * Get logs from a specific collector container using docker CLI
 */
export async function getCollectorLogs(
  collector: CollectorContainer,
  lines: number = 1000
): Promise<string> {
  try {
    // Get the container ID
    const containerId = collector.container.getId()

    // Use docker CLI to get logs
    const { stdout } = await execAsync(`docker logs ${containerId} 2>&1 | tail -${lines}`)
    return stdout
  } catch (error) {
    console.error('Failed to get collector logs:', error)
    return 'Failed to get logs'
  }
}

/**
 * Check if collector received traces
 */
export async function collectorReceivedTraces(collector: CollectorContainer): Promise<boolean> {
  const logs = await getCollectorLogs(collector)

  // Look for trace data in debug exporter output
  const hasTraces =
    logs.includes('Span') ||
    logs.includes('TracesData') ||
    logs.includes('ResourceSpans') ||
    logs.includes('ScopeSpans')

  return hasTraces
}

/**
 * Start an example server
 */
export async function startExample(
  name: string,
  dir: string,
  port: number,
  otlpEndpoint?: string
): Promise<TestServer> {
  console.log(`🚀 Starting ${name} on port ${port}...`)

  return new Promise((resolve, reject) => {
    // Start the server
    const serverProcess = spawn('pnpm', ['start'], {
      cwd: dir,
      env: {
        ...process.env,
        PORT: String(port),
        OTEL_EXPORTER_OTLP_ENDPOINT: otlpEndpoint || 'http://localhost:14318'
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
      // Wait a bit after process exits to ensure SDK shutdown completes
      // The shutdown handler might still be flushing spans
      setTimeout(resolve, 1000)
    })

    server.process.kill('SIGTERM')

    // Force kill after 10 seconds (increased from 5s)
    setTimeout(() => {
      if (!server.process.killed) {
        console.log(`⚠️  Force killing ${server.name}`)
        server.process.kill('SIGKILL')
      }
      // Still wait a bit even after force kill
      setTimeout(resolve, 1000)
    }, 10000)
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
