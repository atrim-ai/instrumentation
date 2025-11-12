/**
 * Unit tests for config-loader
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { loadConfig, clearConfigCache } from '../../src/core/config-loader.js'
import type { InstrumentationConfig } from '../../src/core/instrumentation-schema.js'

describe('config-loader', () => {
  beforeEach(() => {
    clearConfigCache()
  })

  describe('loadConfig', () => {
    it('should return default config when no options provided', async () => {
      const config = await loadConfig()

      expect(config).toBeDefined()
      expect(config.version).toBe('1.0')
      expect(config.instrumentation.enabled).toBe(true)
      expect(config.instrumentation.instrument_patterns.length).toBeGreaterThan(0)
      expect(config.instrumentation.ignore_patterns.length).toBeGreaterThan(0)
    })

    it('should accept explicit config object', async () => {
      const explicitConfig: InstrumentationConfig = {
        version: '1.0',
        instrumentation: {
          enabled: true,
          logging: 'on',
          instrument_patterns: [{ pattern: '^test\\.', enabled: true }],
          ignore_patterns: []
        }
      }

      const config = await loadConfig({ config: explicitConfig })

      expect(config).toEqual(explicitConfig)
    })

    it('should validate config schema', async () => {
      const invalidConfig = {
        version: '1.0'
        // Missing instrumentation field
      }

      await expect(loadConfig({ config: invalidConfig as any })).rejects.toThrow('Invalid configuration')
    })
  })
})
