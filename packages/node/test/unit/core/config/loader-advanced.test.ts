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

      // Zod throws with validation details
      await expect(loadConfigWithOptions({ configPath: testConfigPath })).rejects.toThrow()
    })

    it('should handle missing required fields', async () => {
      const incompleteConfig = `
version: "1.0"
instrumentation:
  enabled: true
`
      writeFileSync(testConfigPath, incompleteConfig, 'utf8')

      // Zod throws with validation details
      await expect(loadConfigWithOptions({ configPath: testConfigPath })).rejects.toThrow()
    })

    it('should handle missing file', async () => {
      await expect(
        loadConfigWithOptions({ configPath: '/nonexistent/path/config.yaml' })
      ).rejects.toThrow()
    })
  })

  describe('remote URL loading', () => {
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
        ).rejects.toThrow('Not Found')
      } finally {
        global.fetch = originalFetch
      }
    })

    it('should load valid remote config', async () => {
      const validConfig = `
version: "1.0"
instrumentation:
  enabled: true
  instrument_patterns: []
  ignore_patterns: []
`
      const originalFetch = global.fetch
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve(validConfig)
      } as unknown as Response)

      try {
        const config = await loadConfigWithOptions({
          configUrl: 'https://example.com/config.yaml'
        })
        expect(config.version).toBe('1.0')
        expect(config.instrumentation.enabled).toBe(true)
      } finally {
        global.fetch = originalFetch
      }
    })

    it('should handle network errors', async () => {
      const originalFetch = global.fetch
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'))

      try {
        await expect(
          loadConfigWithOptions({ configUrl: 'https://example.com/config.yaml' })
        ).rejects.toThrow('Network error')
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
