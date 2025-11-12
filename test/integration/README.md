# Integration Tests

Integration tests for `@atrim/instrumentation` that verify traces are actually sent to an OpenTelemetry collector.

## Architecture

```
┌─────────────────────────┐
│  Playwright Tests       │
│  (Browser automation)   │
└────────┬────────────────┘
         │
         │ HTTP Requests
         ▼
┌─────────────────────────┐
│  Example Servers        │
│  - Express              │
│  - Vanilla              │
│  - Effect-TS            │
│  - Pure Effect          │
└────────┬────────────────┘
         │
         │ OTLP (port 4320)
         ▼
┌─────────────────────────┐
│  OTEL Collector         │
│  (Docker container)     │
│  - Debug exporter       │
│  - Ports: 4319/4320     │
└─────────────────────────┘
```

## Ports Used

- **14318**: OTLP HTTP receiver (test collector)
- **14317**: OTLP gRPC receiver (test collector)
- **14133**: Health check endpoint
- **3100-3199**: Example application ports

These non-standard ports (14317/14318 instead of 4317/4318) are used to avoid conflicts with local collectors and other Atrim services.

## Running Tests

### Prerequisites

1. **Docker** - Required for running OTEL collector
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

### Run Specific Test

```bash
# Run only Express tests
pnpm test express.spec.ts

# Run only Effect Platform tests
pnpm test effect-platform.spec.ts
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

### Express Example
- ✅ HTTP requests handled correctly
- ✅ Traces sent to collector
- ✅ Pattern filtering works (health checks filtered)
- ✅ POST requests create traces
- ✅ Interactive UI loads

### Vanilla Example
- ✅ Pure Node.js HTTP server works
- ✅ Traces sent for all operations
- ✅ Pattern-based filtering applied

### Effect-TS + Express Example
- ✅ Effect.withSpan() creates traces
- ✅ Express auto-instrumentation works
- ✅ Both Effect and HTTP spans present
- ✅ Auto-instrumentation auto-enabled (has web framework)

### Pure Effect-TS Example
- ✅ @effect/platform HTTP server works
- ✅ Effect.withSpan() creates traces
- ✅ Auto-instrumentation auto-disabled (no web framework)
- ✅ No Express/HTTP auto-instrumentation spans
- ✅ Error handling works

## Test Output

### Successful Test

```bash
Running 4 tests using 1 worker

  ✓ [express-example] express.spec.ts:20:7 › Express Example › should respond to requests (523ms)
  ✓ [express-example] express.spec.ts:30:7 › Express Example › should send traces to collector (3.2s)
  ✓ [effect-platform-example] effect-platform.spec.ts:25:7 › Pure Effect-TS Example › should send Effect.withSpan() traces (2.8s)
  ✓ [effect-platform-example] effect-platform.spec.ts:50:7 › Pure Effect-TS Example › auto-instrumentation should be disabled (2.1s)

4 passed (12.3s)
```

### Failed Test

When a test fails, Playwright provides:
- Screenshot of the failure
- Video recording (if configured)
- Trace file for debugging
- Console logs
- Collector logs

## Troubleshooting

### Collector Won't Start

```bash
# Check Docker is running
docker ps

# View collector logs
docker logs atrim-otel-collector-test

# Restart collector
docker-compose -f test/integration/docker-compose.yml restart
```

### No Traces Received

1. Check example server logs
2. Check collector logs:
   ```bash
   docker logs atrim-otel-collector-test | tail -100
   ```
3. Verify OTLP endpoint:
   ```bash
   curl http://localhost:4320/v1/traces
   ```

### Port Conflicts

If ports 4319/4320 are in use:

1. Edit `docker-compose.yml` to use different ports
2. Update `helpers.ts` with new OTLP endpoint
3. Restart tests

### Server Won't Start

```bash
# Check if port is already in use
lsof -i :3100

# Kill any hanging processes
pkill -f "tsx.*examples"
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
import { startExample, stopServer, collectorReceivedTraces } from './helpers.js'

let server: TestServer

test.describe('My Example', () => {
  test.beforeAll(async () => {
    server = await startExample('My-Example', './examples/my-example', 3105)
  })

  test.afterAll(async () => {
    if (server) {
      await stopServer(server)
    }
  })

  test('should send traces', async ({ page }) => {
    await page.goto(`http://localhost:3105/endpoint`)
    await page.waitForTimeout(2000)

    const hasTraces = await collectorReceivedTraces()
    expect(hasTraces).toBeTruthy()
  })
})
```

## Learn More

- [Playwright Documentation](https://playwright.dev)
- [OpenTelemetry Collector](https://opentelemetry.io/docs/collector/)
- [@atrim/instrumentation](../../README.md)
