/**
 * Unit tests for service-detector (Effect-based version)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Effect } from 'effect'
import {
  detectServiceInfo,
  getServiceName,
  getServiceVersion,
  getServiceInfoWithFallback,
  detectServiceInfoAsync,
  getServiceNameAsync,
  getServiceVersionAsync
} from '../../../src/core/service-detector.js'
import { ServiceDetectionError } from '../../../src/core/errors.js'

describe('service-detector (Effect version)', () => {
  let originalEnv: NodeJS.ProcessEnv
  let originalCwd: () => string

  beforeEach(() => {
    // Save original environment and cwd
    originalEnv = { ...process.env }
    originalCwd = process.cwd

    // Clear service-related env vars
    delete process.env.OTEL_SERVICE_NAME
    delete process.env.OTEL_SERVICE_VERSION
  })

  afterEach(() => {
    // Restore original environment and cwd
    process.env = originalEnv
    process.cwd = originalCwd
  })

  describe('detectServiceInfo', () => {
    it('should return service from OTEL_SERVICE_NAME env var', async () => {
      process.env.OTEL_SERVICE_NAME = 'test-service'
      process.env.OTEL_SERVICE_VERSION = '1.2.3'

      const result = await Effect.runPromise(detectServiceInfo)

      expect(result).toEqual({
        name: 'test-service',
        version: '1.2.3'
      })
    })

    it('should return service name only from env var', async () => {
      process.env.OTEL_SERVICE_NAME = 'test-service'

      const result = await Effect.runPromise(detectServiceInfo)

      expect(result).toEqual({
        name: 'test-service',
        version: undefined
      })
    })

    it('should read from package.json when env var not set', async () => {
      // This test runs in the actual project directory with a real package.json
      const result = await Effect.runPromise(detectServiceInfo)

      expect(result.name).toBe('@atrim/instrument-node')
      expect(result.version).toBeDefined()
    })

    it('should fail with ServiceDetectionError when package.json is invalid', async () => {
      // Mock cwd to point to a non-existent directory
      process.cwd = () => '/nonexistent/path/that/does/not/exist'

      // Test with Effect error handling (proper way)
      const program = detectServiceInfo.pipe(
        Effect.match({
          onFailure: (error) => {
            expect(error._tag).toBe('ServiceDetectionError')
            expect(error.reason).toContain('Failed to read package.json')
            return 'error-caught'
          },
          onSuccess: () => 'should-not-succeed'
        })
      )

      const result = await Effect.runPromise(program)
      expect(result).toBe('error-caught')
    })

    it('should prefer OTEL_SERVICE_VERSION over package.json version', async () => {
      process.env.OTEL_SERVICE_VERSION = '9.9.9'

      const result = await Effect.runPromise(detectServiceInfo)

      expect(result.version).toBe('9.9.9')
    })
  })

  describe('getServiceName', () => {
    it('should return service name from env var', async () => {
      process.env.OTEL_SERVICE_NAME = 'my-service'

      const result = await Effect.runPromise(getServiceName)

      expect(result).toBe('my-service')
    })

    it('should return service name from package.json', async () => {
      const result = await Effect.runPromise(getServiceName)

      expect(result).toBe('@atrim/instrument-node')
    })

    it('should return unknown-service when detection fails', async () => {
      // Mock cwd to point to a non-existent directory
      process.cwd = () => '/nonexistent/path/that/does/not/exist'

      const result = await Effect.runPromise(getServiceName)

      expect(result).toBe('unknown-service')
    })
  })

  describe('getServiceVersion', () => {
    it('should return service version from env var', async () => {
      process.env.OTEL_SERVICE_VERSION = '1.2.3'

      const result = await Effect.runPromise(getServiceVersion)

      expect(result).toBe('1.2.3')
    })

    it('should return service version from package.json', async () => {
      const result = await Effect.runPromise(getServiceVersion)

      expect(result).toBeDefined()
      expect(typeof result).toBe('string')
    })

    it('should return undefined when detection fails', async () => {
      // Mock cwd to point to a non-existent directory
      process.cwd = () => '/nonexistent/path/that/does/not/exist'

      const result = await Effect.runPromise(getServiceVersion)

      expect(result).toBeUndefined()
    })
  })

  describe('getServiceInfoWithFallback', () => {
    it('should return service info when detection succeeds', async () => {
      process.env.OTEL_SERVICE_NAME = 'test-service'
      process.env.OTEL_SERVICE_VERSION = '1.0.0'

      const result = await Effect.runPromise(getServiceInfoWithFallback)

      expect(result).toEqual({
        name: 'test-service',
        version: '1.0.0'
      })
    })

    it('should return fallback when detection fails', async () => {
      // Mock cwd to point to a non-existent directory
      process.cwd = () => '/nonexistent/path/that/does/not/exist'

      const result = await Effect.runPromise(getServiceInfoWithFallback)

      expect(result).toEqual({
        name: 'unknown-service',
        version: undefined
      })
    })

    it('should include OTEL_SERVICE_VERSION in fallback if set', async () => {
      process.env.OTEL_SERVICE_VERSION = '1.2.3'
      process.cwd = () => '/nonexistent/path/that/does/not/exist'

      const result = await Effect.runPromise(getServiceInfoWithFallback)

      expect(result).toEqual({
        name: 'unknown-service',
        version: '1.2.3'
      })
    })
  })

  describe('Promise API (backward compatibility)', () => {
    it('detectServiceInfoAsync should work', async () => {
      process.env.OTEL_SERVICE_NAME = 'test-service'

      const result = await detectServiceInfoAsync()

      expect(result.name).toBe('test-service')
    })

    it('getServiceNameAsync should work', async () => {
      process.env.OTEL_SERVICE_NAME = 'test-service'

      const result = await getServiceNameAsync()

      expect(result).toBe('test-service')
    })

    it('getServiceVersionAsync should work', async () => {
      process.env.OTEL_SERVICE_VERSION = '1.2.3'

      const result = await getServiceVersionAsync()

      expect(result).toBe('1.2.3')
    })

    it('Promise API should not throw even when detection fails', async () => {
      process.cwd = () => '/nonexistent/path/that/does/not/exist'

      const info = await detectServiceInfoAsync()
      const name = await getServiceNameAsync()
      const version = await getServiceVersionAsync()

      expect(info.name).toBe('unknown-service')
      expect(name).toBe('unknown-service')
      expect(version).toBeUndefined()
    })
  })

  describe('Error handling', () => {
    it('should handle errors properly in Effect channel', async () => {
      process.cwd = () => '/nonexistent/path/that/does/not/exist'

      const program = detectServiceInfo.pipe(
        Effect.catchTag('ServiceDetectionError', (error) => {
          expect(error._tag).toBe('ServiceDetectionError')
          expect(error.reason).toContain('Failed to read package.json')
          return Effect.succeed({ name: 'caught-error', version: undefined })
        })
      )

      const result = await Effect.runPromise(program)

      expect(result.name).toBe('caught-error')
    })

    it('should compose well with other Effects', async () => {
      process.env.OTEL_SERVICE_NAME = 'test-service'

      const program = Effect.gen(function* () {
        const name = yield* getServiceName
        const version = yield* getServiceVersion
        return `${name}@${version || 'unknown'}`
      })

      const result = await Effect.runPromise(program)

      expect(result).toContain('test-service')
    })
  })
})
