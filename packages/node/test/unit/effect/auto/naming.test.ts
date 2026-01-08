/**
 * Tests for span name inference
 */

import { describe, it, expect } from 'vitest'
import {
  inferSpanName,
  sanitizeSpanName,
  type SourceInfo
} from '../../../../src/integrations/effect/auto/naming.js'
import type { AutoInstrumentationConfig } from '@atrim/instrument-core'

describe('inferSpanName', () => {
  const baseConfig: AutoInstrumentationConfig = {
    enabled: true,
    granularity: 'fiber',
    span_naming: {
      default: 'effect.fiber.{fiber_id}',
      infer_from_source: true,
      rules: []
    },
    filter: { include: [], exclude: [] },
    performance: { sampling_rate: 1.0, min_duration: '0ms', max_concurrent: 0 },
    metadata: { fiber_info: true, source_location: true, parent_fiber: true }
  }

  describe('default naming', () => {
    it('should use fiber_id when no source info available', () => {
      const result = inferSpanName(123, undefined, baseConfig)
      expect(result).toBe('effect.fiber.123')
    })

    it('should use function name when source info available', () => {
      const sourceInfo: SourceInfo = {
        function: 'myFunction',
        file: '/path/to/file.ts',
        line: 42,
        column: 10
      }
      const config: AutoInstrumentationConfig = {
        ...baseConfig,
        span_naming: {
          default: 'effect.{function}',
          infer_from_source: true,
          rules: []
        }
      }
      const result = inferSpanName(123, sourceInfo, config)
      expect(result).toBe('effect.myFunction')
    })

    it('should extract module name from file path', () => {
      const sourceInfo: SourceInfo = {
        function: 'myFunction',
        file: '/path/to/UserService.ts',
        line: 42,
        column: 10
      }
      const config: AutoInstrumentationConfig = {
        ...baseConfig,
        span_naming: {
          default: '{module}.{function}',
          infer_from_source: true,
          rules: []
        }
      }
      const result = inferSpanName(123, sourceInfo, config)
      expect(result).toBe('User.myFunction') // "Service" suffix removed
    })
  })

  describe('naming rules', () => {
    it('should match file pattern and apply rule', () => {
      const sourceInfo: SourceInfo = {
        function: 'getUserById',
        file: '/app/src/services/UserService.ts',
        line: 42,
        column: 10
      }
      const config: AutoInstrumentationConfig = {
        ...baseConfig,
        span_naming: {
          default: 'effect.{function}',
          infer_from_source: true,
          rules: [
            {
              match: { file: 'src/services/.*' },
              name: 'service.{function}'
            }
          ]
        }
      }
      const result = inferSpanName(123, sourceInfo, config)
      expect(result).toBe('service.getUserById')
    })

    it('should match function pattern and apply rule', () => {
      const sourceInfo: SourceInfo = {
        function: 'fetchUserData',
        file: '/app/src/api.ts',
        line: 42,
        column: 10
      }
      const config: AutoInstrumentationConfig = {
        ...baseConfig,
        span_naming: {
          default: 'effect.{function}',
          infer_from_source: true,
          rules: [
            {
              match: { function: 'fetch.*' },
              name: 'http.{function}'
            }
          ]
        }
      }
      const result = inferSpanName(123, sourceInfo, config)
      expect(result).toBe('http.fetchUserData')
    })

    it('should fall through to default when no rules match', () => {
      const sourceInfo: SourceInfo = {
        function: 'randomFunction',
        file: '/app/src/utils.ts',
        line: 42,
        column: 10
      }
      const config: AutoInstrumentationConfig = {
        ...baseConfig,
        span_naming: {
          default: 'effect.{function}',
          infer_from_source: true,
          rules: [
            {
              match: { file: 'src/services/.*' },
              name: 'service.{function}'
            }
          ]
        }
      }
      const result = inferSpanName(123, sourceInfo, config)
      expect(result).toBe('effect.randomFunction')
    })

    it('should require all match criteria to be satisfied', () => {
      const sourceInfo: SourceInfo = {
        function: 'getUser',
        file: '/app/src/api.ts', // doesn't match services
        line: 42,
        column: 10
      }
      const config: AutoInstrumentationConfig = {
        ...baseConfig,
        span_naming: {
          default: 'effect.{function}',
          infer_from_source: true,
          rules: [
            {
              match: { file: 'src/services/.*', function: 'get.*' },
              name: 'service.{function}'
            }
          ]
        }
      }
      const result = inferSpanName(123, sourceInfo, config)
      // Should fall through to default because file doesn't match
      expect(result).toBe('effect.getUser')
    })
  })

  describe('template variables', () => {
    it('should replace all supported variables', () => {
      const sourceInfo: SourceInfo = {
        function: 'myFunc',
        file: '/path/to/MyModule.ts',
        line: 42,
        column: 10
      }
      const config: AutoInstrumentationConfig = {
        ...baseConfig,
        span_naming: {
          default: '{module}.{function}.{fiber_id}.{line}',
          infer_from_source: true,
          rules: []
        }
      }
      const result = inferSpanName(999, sourceInfo, config)
      expect(result).toBe('MyModule.myFunc.999.42')
    })

    it('should handle missing source info gracefully', () => {
      const config: AutoInstrumentationConfig = {
        ...baseConfig,
        span_naming: {
          default: '{module}.{function}.{line}',
          infer_from_source: true,
          rules: []
        }
      }
      const result = inferSpanName(123, undefined, config)
      expect(result).toBe('unknown.anonymous.0')
    })
  })
})

describe('sanitizeSpanName', () => {
  it('should return default for empty string', () => {
    expect(sanitizeSpanName('')).toBe('effect.fiber.unknown')
  })

  it('should replace invalid characters', () => {
    expect(sanitizeSpanName('hello world!')).toBe('hello_world')
  })

  it('should preserve valid characters', () => {
    expect(sanitizeSpanName('my.span-name_123')).toBe('my.span-name_123')
  })

  it('should collapse multiple underscores', () => {
    expect(sanitizeSpanName('hello   world')).toBe('hello_world')
  })

  it('should remove leading/trailing underscores', () => {
    expect(sanitizeSpanName('__hello__')).toBe('hello')
  })

  it('should truncate long names', () => {
    const longName = 'a'.repeat(300)
    const result = sanitizeSpanName(longName)
    expect(result.length).toBe(256)
  })
})
