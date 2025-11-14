# Integration Tests

Integration tests for `@atrim/instrumentation` that verify traces are actually sent to an OpenTelemetry collector.

## Architecture

```
┌─────────────────────────┐
│  Playwright Tests       │
│  (8 parallel workers)   │
└────────┬────────────────┘
         │
         │ Each test suite gets:
         ├─────────────────────────┐
         │                         │
         ▼                         ▼
┌──────────────────┐      ┌──────────────────┐
│  Test Suite 1    │      │  Test Suite 2    │
│  ├─ Collector    │      │  ├─ Collector    │
│  │  (isolated)   │      │  │  (isolated)   │
│  └─ App Server   │      │  └─ App Server   │
│     (unique port)│      │     (unique port)│
└──────────────────┘      └──────────────────┘
```

**Key Features:**
- ✅ **Isolated collectors** - Each test suite runs with its own OTEL collector container
- ✅ **Parallel execution** - Tests run simultaneously across 8 workers
- ✅ **No cross-contamination** - Test suites can't interfere with each other
- ✅ **Dynamic ports** - Automatically assigned unique ports for each container
- ✅ **Testcontainers** - Automatic container lifecycle management

## Ports

Ports are **dynamically assigned** to avoid conflicts:

- **Collector HTTP**: Randomly assigned (e.g., 55928, 55931, etc.)
- **Collector gRPC**: Randomly assigned
- **Collector Health**: Randomly assigned
- **App Servers**: BASE_PORT + (workerIndex * 10)
  - Express: 3100, 3110, 3120, 3130...
  - Vanilla: 3101, 3111, 3121, 3131...
  - Effect-TS: 3102, 3112, 3122, 3132...
  - Effect-Platform: 3103, 3113, 3123, 3133...

## Running Tests

### Prerequisites

1. **Docker** - Required for testcontainers
2. **pnpm** - For package management
3. **Node.js 18+** - Runtime

### Install Dependencies

```bash
cd test/integration
pnpm install
```

### Run All Tests

```bash
# From repository root
pnpm test:integration

# Or from test/integration directory
pnpm test
```

Tests run in **parallel** by default (8 workers):
```bash
Running 31 tests using 8 workers
✅ 29 passed in ~20s
```

### Run Specific Project

```bash
# Run only Express tests
pnpm test --project=express-example

# Run only Effect Platform tests
pnpm test --project=effect-platform-example
```

### Debug Mode

```bash
# Run with Playwright Inspector
pnpm test:debug

# Run in headed mode (see browser)
pnpm test:headed

# Open Playwright UI
pnpm test:ui
```

## What's Tested

### Express Example (5/5 passing ✅)
- ✅ HTTP requests handled correctly
- ✅ Traces sent to isolated collector
- ✅ Pattern filtering works (health checks filtered)
- ✅ POST requests create traces
- ✅ Interactive UI loads

### Vanilla Example (5/5 passing ✅)
- ✅ Pure Node.js HTTP server works
- ✅ Traces sent for all operations
- ✅ Database operation spans
- ✅ Cache operation spans
- ✅ Interactive UI loads

### Effect-TS + Express Example (8/8 passing ✅)
- ✅ Effect.withSpan() creates traces
- ✅ Express auto-instrumentation works
- ✅ Both Effect and HTTP spans present
- ✅ Auto-instrumentation auto-enabled (has web framework)
- ✅ Race/retry/timeout operations traced
- ✅ Error handling works

### Pure Effect-TS Example (2/4 passing ⚠️)
- ✅ @effect/platform HTTP server works
- ✅ Auto-instrumentation auto-disabled (no web framework)
- ⚠️ Effect.withSpan() traces (investigating)
- ⚠️ Error handling (investigating)

### Detection Tests (8/8 passing ✅)
- ✅ Detects existing NodeSDK initialization
- ✅ Detects Effect-TS without web framework
- ✅ Enables auto-instrumentation for Express + Effect
- ✅ Respects explicit autoInstrument settings
- ✅ Handles multiple initialization attempts
- ✅ Pattern-only mode when SDK exists
- ✅ Configuration priority handling

## Test Output

### Successful Run

```bash
Running 31 tests using 8 workers

🚀 Starting isolated OTEL Collector container...
🚀 Starting isolated OTEL Collector container...
🚀 Starting isolated OTEL Collector container...
...
✅ Collector ready - HTTP: 55928, gRPC: 55927, Health: 55929
✅ Collector ready - HTTP: 55931, gRPC: 55930, Health: 55932
...

  ✓ [express-example] › express.spec.ts:52:3 › should respond to requests (172ms)
  ✓ [vanilla-example] › vanilla.spec.ts:52:3 › should respond to requests (117ms)
  ...

🧹 Tearing down integration tests...
✅ Isolated collector containers stopped by individual test suites

  29 passed (20.3s)
```

### Failed Test

When a test fails, Playwright provides:
- Screenshot of the failure
- Video recording
- Trace file for debugging
- Console logs
- Collector logs

## Troubleshooting

### Docker Not Running

```bash
# Check Docker daemon
docker ps

# Start Docker Desktop (macOS/Windows)
# or start Docker service (Linux)
sudo systemctl start docker
```

### No Traces Received

1. **Check test output** - Collector logs are shown in test output
2. **Check app server logs** - Look for "SDK initialized successfully"
3. **Verify collector is healthy** - Should see "Collector ready" in logs
4. **Check for errors** - Look for any error messages in test output

### Port Conflicts

Port conflicts are **automatically avoided** by:
- Testcontainers assigning random ports for collectors
- Worker-based port allocation for app servers

If you still see EADDRINUSE errors:
```bash
# Kill any hanging processes
pkill -f "tsx.*examples"

# Check what's using a port
lsof -i :3100
```

### Tests Hang or Timeout

```bash
# Check for orphaned containers
docker ps -a | grep otel

# Clean up all containers
docker container prune

# Restart tests
pnpm test
```

### Collector Container Issues

```bash
# View running containers
docker ps

# View all containers (including stopped)
docker ps -a

# View logs for a specific container
docker logs <container-id>

# Force remove containers
docker rm -f $(docker ps -a -q --filter ancestor=otel/opentelemetry-collector)
```

## CI/CD Integration

### GitHub Actions

```yaml
name: Integration Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install pnpm
        uses: pnpm/action-setup@v2
        with:
          version: 8

      - name: Install dependencies
        run: pnpm install

      - name: Run integration tests
        run: pnpm test:integration

      - name: Upload test results
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: test/integration/playwright-report
```

## Writing New Tests

### Template

```typescript
import { test, expect } from '@playwright/test'
import {
  startExample,
  stopServer,
  startCollectorContainer,
  stopCollectorContainer,
  collectorReceivedTraces,
  type TestServer,
  type CollectorContainer
} from './helpers.js'
import path from 'path'

const EXAMPLE_DIR = path.join(process.cwd(), '../../examples/my-example')
const BASE_PORT = 3105

let server: TestServer
let collector: CollectorContainer
let port: number

test.describe('My Example', () => {
  test.beforeAll(async ({ }, testInfo) => {
    // Use worker-specific port to avoid conflicts
    port = BASE_PORT + (testInfo.workerIndex * 10)

    // Start isolated collector container
    collector = await startCollectorContainer()

    // Start the example server
    server = await startExample(
      'My-Example',
      EXAMPLE_DIR,
      port,
      `http://localhost:${collector.httpPort}`
    )
  })

  test.afterAll(async () => {
    if (server) {
      await stopServer(server)
    }
    if (collector) {
      await stopCollectorContainer(collector)
    }
  })

  test('should send traces', async ({ page }) => {
    await page.goto(`http://localhost:${port}/endpoint`)
    await page.waitForTimeout(2000)

    const hasTraces = await collectorReceivedTraces(collector)
    expect(hasTraces).toBeTruthy()
  })
})
```

### Key Points

1. **Always use isolated collectors** - Each test suite should start its own
2. **Worker-specific ports** - Use `BASE_PORT + (testInfo.workerIndex * 10)`
3. **Clean up containers** - Always stop collector in `afterAll`
4. **Pass collector to functions** - Helper functions need the collector instance

## Learn More

- [Playwright Documentation](https://playwright.dev)
- [Testcontainers Documentation](https://node.testcontainers.org/)
- [OpenTelemetry Collector](https://opentelemetry.io/docs/collector/)
- [@atrim/instrumentation](../../README.md)
