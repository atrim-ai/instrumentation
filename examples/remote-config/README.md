# Remote Configuration Example

This example demonstrates loading instrumentation configuration from a **remote URL** instead of a local file. This is essential for production deployments where centralized configuration management is required.

## What This Example Shows

- ✅ Loading config from remote HTTP/HTTPS URLs
- ✅ Environment-specific configurations (production, staging, development)
- ✅ Configuration caching (5 minute default)
- ✅ Fallback to default config on network errors
- ✅ Simulated config server (demonstrates real-world setup)
- ✅ Dynamic pattern updates without code changes

## Architecture

This example includes two services:

### 1. Configuration Server (Port 3100)
A simple HTTP server that serves YAML configurations for different environments:
- `/config/instrumentation.yaml` - Default config
- `/config/production/instrumentation.yaml` - Production config
- `/config/staging/instrumentation.yaml` - Staging config
- `/config/development/instrumentation.yaml` - Development config

### 2. Application Server (Port 3004)
The main application that loads configuration from the config server and demonstrates different tracing patterns based on environment.

## Prerequisites

1. **Node.js 18+** installed
2. **OpenTelemetry collector running**
   ```bash
   docker run -p 4318:4318 -p 4317:4317 otel/opentelemetry-collector
   ```

## Running the Example

### Option 1: Run Everything Together (Recommended)

```bash
# Install dependencies (from repository root)
pnpm install

# Navigate to this example
cd examples/remote-config

# Install dependencies
pnpm install

# Run both config server and app together
pnpm start
```

This starts:
- Config server on http://localhost:3100
- Application on http://localhost:3004

**Open the UI:** Visit http://localhost:3004 in your browser!

### Option 2: Run Separately

```bash
# Terminal 1: Config server
pnpm run config-server

# Terminal 2: Application (default environment)
pnpm run app

# Or specify environment
APP_ENV=production pnpm run app
APP_ENV=staging pnpm run app
APP_ENV=development pnpm run app
```

## Using Different Environments

Each environment has different tracing patterns:

### Default Environment
```bash
pnpm run app
# or
APP_ENV=default pnpm run app
```

**Traced spans:**
- `app.*` - Application operations
- `demo.*` - Demo operations

**Filtered spans:**
- `internal.*` - Internal utilities
- `test.*` - Test utilities

### Production Environment
```bash
APP_ENV=production pnpm run app
```

**Traced spans:**
- `app.*` - Application operations
- `api.*` - API operations
- `storage.*` - Storage operations

**Filtered spans:**
- `internal.*` - Internal utilities
- `test.*` - Test utilities
- `debug.*` - Debug operations (production-specific)
- `dev.*` - Development operations (production-specific)

### Staging Environment
```bash
APP_ENV=staging pnpm run app
```

**Traced spans:**
- `app.*` - Application operations
- `api.*` - API operations
- `storage.*` - Storage operations
- `debug.*` - Debug operations (enabled in staging)

**Filtered spans:**
- `internal.*` - Internal utilities
- `test.*` - Test utilities

### Development Environment
```bash
APP_ENV=development pnpm run app
```

**Traced spans:**
- `.*` - **Everything** (trace all operations)

**Filtered spans:**
- `test.*` - Test utilities only

## Configuration Server Details

The config server simulates a production configuration service. In production, you would use:

### Cloud Storage Options
- **AWS S3** - `https://my-bucket.s3.amazonaws.com/configs/instrumentation.yaml`
- **GCS** - `https://storage.googleapis.com/my-bucket/configs/instrumentation.yaml`
- **Azure Blob** - `https://mystorageaccount.blob.core.windows.net/configs/instrumentation.yaml`

### CDN Options
- **CloudFront** - `https://d111111abcdef8.cloudfront.net/configs/instrumentation.yaml`
- **Cloudflare** - `https://config.example.com/instrumentation.yaml`

### Version Control
- **GitHub Raw** - `https://raw.githubusercontent.com/org/repo/main/configs/instrumentation.yaml`
- **GitLab** - `https://gitlab.com/org/repo/-/raw/main/configs/instrumentation.yaml`

### Configuration Management Services
- **Consul** - `http://consul.service.consul:8500/v1/kv/instrumentation/config`
- **etcd** - `http://etcd.service:2379/v3/kv/range`
- **AWS AppConfig** - Via SDK

## How Remote Config Works

```typescript
import { initializeInstrumentation } from '@atrim/instrumentation'

// Load config from remote URL
await initializeInstrumentation({
  configUrl: 'http://localhost:3100/config/production/instrumentation.yaml',
  cacheTimeout: 300_000, // Cache for 5 minutes
  serviceName: 'my-service'
})
```

### Caching Behavior

The library caches remote configurations to:
- ✅ Reduce network requests
- ✅ Improve startup performance
- ✅ Provide fallback during network issues

**Default cache:** 5 minutes (300,000 ms)

To disable caching:
```typescript
await initializeInstrumentation({
  configUrl: 'http://config-server/instrumentation.yaml',
  cacheTimeout: 0 // No caching
})
```

### Fallback Strategy

If the remote config fails to load:
1. Check local `./instrumentation.yaml` file
2. Use built-in default configuration
3. Log warning but continue running

This ensures your application doesn't fail due to config server issues.

## Security Considerations

### HTTPS Required in Production

**Always use HTTPS** for remote configs in production:

```typescript
// ✅ Good (HTTPS)
configUrl: 'https://config.example.com/instrumentation.yaml'

// ❌ Bad (HTTP) - only for local development
configUrl: 'http://config.example.com/instrumentation.yaml'
```

### Authentication

For authenticated endpoints, use environment variables:

```typescript
const configUrl = process.env.CONFIG_URL
const authToken = process.env.CONFIG_AUTH_TOKEN

// Add authentication in your config server
fetch(configUrl, {
  headers: {
    'Authorization': `Bearer ${authToken}`
  }
})
```

### Rate Limiting

The library includes built-in protections:
- ✅ Request timeouts (5 seconds default)
- ✅ Configuration caching
- ✅ Max config size limit (1MB)
- ✅ Schema validation

## Expected Output

```
📦 @atrim/instrumentation - Remote Configuration Example

============================================================

🚀 Setting up OpenTelemetry with remote configuration...

📡 Environment: production
📡 Config server: http://localhost:3100
📡 Loading config from: http://localhost:3100/config/production/instrumentation.yaml

@atrim/instrumentation: Initialized successfully
  - Enabled: true
  - Instrument patterns: 3
  - Ignore patterns: 4
  - Description: Production environment configuration - optimized for performance

✅ Remote configuration loaded successfully!

🌐 Application server listening on http://localhost:3004

============================================================
🎨 Interactive UI:
   👉 Open http://localhost:3004 in your browser

📊 Or try these curl requests:
   curl -X POST http://localhost:3004/api/workflow
   curl http://localhost:3004/api/user/user-789
   curl http://localhost:3004/api/debug

============================================================
💡 Configuration Details:
   - Environment: production
   - Config source: Remote URL
   - Config server: http://localhost:3100
   - Cache timeout: 5 minutes

============================================================
🔄 To change environment:
   APP_ENV=production npm run app
   APP_ENV=staging npm run app
   APP_ENV=development npm run app
```

## Benefits of Remote Configuration

### 1. Centralized Management
- ✅ One source of truth for all services
- ✅ Update patterns without redeploying
- ✅ Consistent tracing across microservices

### 2. Environment-Specific Configs
- ✅ More verbose tracing in development
- ✅ Optimized patterns in production
- ✅ Debug spans only in staging

### 3. Dynamic Updates
- ✅ Change patterns on the fly
- ✅ Add/remove ignore patterns
- ✅ Enable/disable instrumentation

### 4. Multi-Service Consistency
- ✅ All services use same patterns
- ✅ Easier to reason about traces
- ✅ Consistent cost management

## Troubleshooting

### Config server not responding

```bash
# Check if config server is running
curl http://localhost:3100/health

# Check available configs
curl http://localhost:3100/configs
```

### Remote config not loading

1. Check network connectivity
2. Verify config URL is correct
3. Check for CORS issues (browser only)
4. Review application logs for errors

### Unexpected spans being created/dropped

1. Check which environment you're running
2. Verify config is loading from correct URL
3. Review patterns in config file
4. Check cache timeout (may be using old config)

## Production Deployment Checklist

- [ ] Use HTTPS for config URLs
- [ ] Implement authentication for config endpoint
- [ ] Set up CDN for config distribution
- [ ] Configure appropriate cache timeouts
- [ ] Implement fallback configs
- [ ] Monitor config server health
- [ ] Set up alerts for config failures
- [ ] Document environment-specific patterns
- [ ] Test config updates in staging first

## Next Steps

- Try the [multi-service example](../multi-service/) for distributed tracing
- See [vanilla example](../vanilla/) for simpler local config
- Check [documentation](../../docs/configuration.md) for more config options
- Read [API reference](../../docs/api-reference.md) for all features
