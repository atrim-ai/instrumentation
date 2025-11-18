/**
 * Advanced unit tests for config-loader (error handling, edge cases)
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { loadConfigWithOptions, clearConfigCache } from '@atrim/instrument-node'
import { writeFileSync, mkdirSync, rmSync } from 'fs'
import { join } from 'path'

describe('config-loader (advanced)', () => {
  const testDir = join(process.cwd(), 'test-tmp')
  const testConfigPath = join(testDir, 'test-config.yaml')

  beforeEach(() => {
    // Create test directory
    mkdirSync(testDir, { recursive: true })
    // Reset config cache before each test
    clearConfigCache()
  })

  afterEach(() => {
    // Clean up test directory
    try {
      rmSync(testDir, { recursive: true, force: true })
    } catch (err) {
      // Ignore cleanup errors
    }
  })

  describe('file loading', () => {
    it('should load config from custom file path', async () => {
      const yamlContent = `
version: "1.0"
instrumentation:
  enabled: true
  instrument_patterns:
    - pattern: "^custom\\\\."
      enabled: true
  ignore_patterns: []
`
      writeFileSync(testConfigPath, yamlContent, 'utf8')

      const config = await loadConfigWithOptions({ configPath: testConfigPath })

      expect(config.instrumentation.instrument_patterns[0]?.pattern).toBe('^custom\\.')
    })

    it('should reject oversized config files', async () => {
      // Create a config larger than 1MB
      const largeContent = 'version: "1.0"\n' + 'x: "' + 'a'.repeat(2_000_000) + '"'
      writeFileSync(testConfigPath, largeContent, 'utf8')

      await expect(loadConfigWithOptions({ configPath: testConfigPath })).rejects.toThrow(
        'exceeds maximum size'
      )
    })

    it('should handle invalid YAML', async () => {
      const invalidYaml = `
version: "1.0"
instrumentation:
  enabled: true
  instrument_patterns: [
    - pattern: "invalid"
`
      writeFileSync(testConfigPath, invalidYaml, 'utf8')

      await expect(loadConfigWithOptions({ configPath: testConfigPath })).rejects.toThrow()
    })

    it('should validate config schema', async () => {
      const invalidConfig = `
version: "1.0"
instrumentation:
  enabled: "not-a-boolean"
  instrument_patterns: []
  ignore_patterns: []
`
      writeFileSync(testConfigPath, invalidConfig, 'utf8')

      await expect(loadConfigWithOptions({ configPath: testConfigPath })).rejects.toThrow(
        'Invalid configuration'
      )
    })

    it('should handle missing required fields', async () => {
      const incompleteConfig = `
version: "1.0"
instrumentation:
  enabled: true
`
      writeFileSync(testConfigPath, incompleteConfig, 'utf8')

      await expect(loadConfigWithOptions({ configPath: testConfigPath })).rejects.toThrow(
        'Invalid configuration'
      )
    })
  })

  describe('remote URL loading', () => {
    it('should reject non-HTTPS URLs', async () => {
      await expect(
        loadConfigWithOptions({ configUrl: 'http://insecure.example.com/config.yaml' })
      ).rejects.toThrow('Insecure protocol')
    })

    it('should handle network timeouts', async () => {
      // Mock fetch to simulate timeout
      const originalFetch = global.fetch
      global.fetch = vi.fn().mockImplementation(
        () =>
          new Promise((_, reject) => {
            setTimeout(() => reject(new Error('AbortError')), 10)
          })
      )

      try {
        await expect(
          loadConfigWithOptions({ configUrl: 'https://example.com/config.yaml' })
        ).rejects.toThrow('Failed to load config from URL')
      } finally {
        global.fetch = originalFetch
      }
    }, 10000)

    it('should handle HTTP error responses', async () => {
      const originalFetch = global.fetch
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found'
      } as Response)

      try {
        await expect(
          loadConfigWithOptions({ configUrl: 'https://example.com/config.yaml' })
        ).rejects.toThrow('HTTP 404')
      } finally {
        global.fetch = originalFetch
      }
    })

    it('should cache remote configs', async () => {
      const validConfig = `
version: "1.0"
instrumentation:
  enabled: true
  instrument_patterns: []
  ignore_patterns: []
`
      const originalFetch = global.fetch
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: {
          get: () => String(validConfig.length)
        },
        text: () => Promise.resolve(validConfig)
      } as unknown as Response)

      global.fetch = mockFetch

      try {
        // First call should fetch
        await loadConfigWithOptions({ configUrl: 'https://example.com/config.yaml' })
        expect(mockFetch).toHaveBeenCalledTimes(1)

        // Second call should use cache
        await loadConfigWithOptions({ configUrl: 'https://example.com/config.yaml' })
        expect(mockFetch).toHaveBeenCalledTimes(1) // Still only called once
      } finally {
        global.fetch = originalFetch
      }
    })

    it('should respect cache timeout', async () => {
      const validConfig = `
version: "1.0"
instrumentation:
  enabled: true
  instrument_patterns: []
  ignore_patterns: []
`
      const originalFetch = global.fetch
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: {
          get: () => String(validConfig.length)
        },
        text: () => Promise.resolve(validConfig)
      } as unknown as Response)

      global.fetch = mockFetch

      try {
        // Load with 0 cache timeout (immediate expiry)
        await loadConfigWithOptions({
          configUrl: 'https://example.com/config.yaml',
          cacheTimeout: 0
        })
        expect(mockFetch).toHaveBeenCalledTimes(1)

        // Second call should fetch again (cache expired)
        await loadConfigWithOptions({
          configUrl: 'https://example.com/config.yaml',
          cacheTimeout: 0
        })
        expect(mockFetch).toHaveBeenCalledTimes(2)
      } finally {
        global.fetch = originalFetch
      }
    })
  })

  describe('environment variable loading', () => {
    afterEach(() => {
      delete process.env.ATRIM_INSTRUMENTATION_CONFIG
    })

    it('should load from env var file path', async () => {
      const yamlContent = `
version: "1.0"
instrumentation:
  enabled: true
  instrument_patterns:
    - pattern: "^env\\\\."
      enabled: true
  ignore_patterns: []
`
      writeFileSync(testConfigPath, yamlContent, 'utf8')
      process.env.ATRIM_INSTRUMENTATION_CONFIG = testConfigPath

      const config = await loadConfigWithOptions()

      expect(config.instrumentation.instrument_patterns[0]?.pattern).toBe('^env\\.')
    })
  })

  describe('priority order', () => {
    it('should prioritize explicit config over env var', async () => {
      const yamlContent = `
version: "1.0"
instrumentation:
  enabled: true
  description: "From file"
  instrument_patterns: []
  ignore_patterns: []
`
      writeFileSync(testConfigPath, yamlContent, 'utf8')
      process.env.ATRIM_INSTRUMENTATION_CONFIG = testConfigPath

      const explicitConfig = {
        version: '1.0',
        instrumentation: {
          enabled: true,
          description: 'Explicit config',
          instrument_patterns: [],
          ignore_patterns: []
        }
      }

      const config = await loadConfigWithOptions({ config: explicitConfig })

      expect(config.instrumentation.description).toBe('Explicit config')

      delete process.env.ATRIM_INSTRUMENTATION_CONFIG
    })
  })
})
