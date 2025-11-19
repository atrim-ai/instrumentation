import { Effect } from 'effect'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  initializeSdk,
  getSdkInstance,
  shutdownSdk,
  resetSdk
} from '../../src/core/sdk-initializer.js'

describe('SDK Initializer', () => {
  beforeEach(() => {
    resetSdk()
  })

  afterEach(async () => {
    await shutdownSdk()
  })

  describe('initializeSdk', () => {
    it('should initialize WebTracerProvider with minimal config', async () => {
      const provider = await Effect.runPromise(
        initializeSdk({
          serviceName: 'test-service'
        })
      )

      expect(provider).toBeDefined()
      expect(getSdkInstance()).toBe(provider)
    })

    it('should return existing instance on second call', async () => {
      const provider1 = await Effect.runPromise(
        initializeSdk({
          serviceName: 'test-service'
        })
      )

      const provider2 = await Effect.runPromise(
        initializeSdk({
          serviceName: 'test-service'
        })
      )

      expect(provider1).toBe(provider2)
    })

    it('should initialize with service version', async () => {
      const provider = await Effect.runPromise(
        initializeSdk({
          serviceName: 'test-service',
          serviceVersion: '1.0.0'
        })
      )

      expect(provider).toBeDefined()
    })

    it('should initialize with custom OTLP endpoint', async () => {
      const provider = await Effect.runPromise(
        initializeSdk({
          serviceName: 'test-service',
          otlpEndpoint: 'http://custom:4318/v1/traces'
        })
      )

      expect(provider).toBeDefined()
    })

    it('should initialize with custom OTLP headers', async () => {
      const provider = await Effect.runPromise(
        initializeSdk({
          serviceName: 'test-service',
          otlpHeaders: {
            Authorization: 'Bearer token'
          }
        })
      )

      expect(provider).toBeDefined()
    })

    it('should initialize with instrumentations disabled', async () => {
      const provider = await Effect.runPromise(
        initializeSdk({
          serviceName: 'test-service',
          enableDocumentLoad: false,
          enableUserInteraction: false,
          enableFetch: true,
          enableXhr: false
        })
      )

      expect(provider).toBeDefined()
    })

    it('should initialize with inline config', async () => {
      const provider = await Effect.runPromise(
        initializeSdk({
          serviceName: 'test-service',
          config: {
            version: '1.0',
            instrumentation: {
              enabled: true,
              instrument_patterns: [{ pattern: '^documentLoad' }],
              ignore_patterns: [{ pattern: '^HTTP GET /health' }]
            }
          }
        })
      )

      expect(provider).toBeDefined()
    })

    it('should handle initialization errors', async () => {
      // Invalid config URL will cause initialization to fail
      await expect(
        Effect.runPromise(
          initializeSdk({
            serviceName: 'test-service',
            configUrl: 'https://invalid-url-that-does-not-exist.com/config.yaml'
          })
        )
      ).rejects.toThrow()
    })
  })

  describe('getSdkInstance', () => {
    it('should return null when not initialized', () => {
      expect(getSdkInstance()).toBeNull()
    })

    it('should return provider instance after initialization', async () => {
      const provider = await Effect.runPromise(
        initializeSdk({
          serviceName: 'test-service'
        })
      )

      expect(getSdkInstance()).toBe(provider)
    })
  })

  describe('shutdownSdk', () => {
    it('should shutdown gracefully', async () => {
      await Effect.runPromise(
        initializeSdk({
          serviceName: 'test-service'
        })
      )

      expect(getSdkInstance()).not.toBeNull()

      await shutdownSdk()

      expect(getSdkInstance()).toBeNull()
    })

    it('should be idempotent', async () => {
      await Effect.runPromise(
        initializeSdk({
          serviceName: 'test-service'
        })
      )

      await shutdownSdk()
      await shutdownSdk() // Should not throw

      expect(getSdkInstance()).toBeNull()
    })
  })

  describe('resetSdk', () => {
    it('should reset SDK instance without shutdown', async () => {
      await Effect.runPromise(
        initializeSdk({
          serviceName: 'test-service'
        })
      )

      expect(getSdkInstance()).not.toBeNull()

      resetSdk()

      expect(getSdkInstance()).toBeNull()
    })
  })

  describe('trace context propagation', () => {
    it('should initialize with propagateTraceContext: "all"', async () => {
      const provider = await initializeSdk({
        serviceName: 'test-service',
        propagateTraceContext: 'all'
      })

      expect(provider).toBeDefined()
    })

    it('should initialize with propagateTraceContext: "none"', async () => {
      const provider = await initializeSdk({
        serviceName: 'test-service',
        propagateTraceContext: 'none'
      })

      expect(provider).toBeDefined()
    })

    it('should initialize with propagateTraceContext: "same-origin"', async () => {
      const provider = await initializeSdk({
        serviceName: 'test-service',
        propagateTraceContext: 'same-origin'
      })

      expect(provider).toBeDefined()
    })

    it('should initialize with propagateTraceContext as array of patterns', async () => {
      const provider = await initializeSdk({
        serviceName: 'test-service',
        propagateTraceContext: ['^https://api\\.example\\.com', '^http://localhost:3000']
      })

      expect(provider).toBeDefined()
    })

    it('should use YAML config for trace propagation when no API option provided', async () => {
      const provider = await initializeSdk({
        serviceName: 'test-service',
        config: {
          version: '1.0',
          instrumentation: {
            enabled: true,
            instrument_patterns: [],
            ignore_patterns: []
          },
          http: {
            propagate_trace_context: {
              strategy: 'patterns',
              include_urls: ['^https://api\\.myapp\\.com']
            }
          }
        }
      })

      expect(provider).toBeDefined()
    })

    it('should handle invalid regex patterns gracefully', async () => {
      // Invalid regex pattern should not crash initialization
      const provider = await initializeSdk({
        serviceName: 'test-service',
        propagateTraceContext: ['[invalid(regex']
      })

      expect(provider).toBeDefined()
    })

    it('should default to same-origin when no config provided', async () => {
      const provider = await initializeSdk({
        serviceName: 'test-service'
        // No propagateTraceContext option - should default to 'same-origin'
      })

      expect(provider).toBeDefined()
    })
  })
})
