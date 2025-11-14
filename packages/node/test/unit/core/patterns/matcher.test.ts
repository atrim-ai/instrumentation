/**
 * Unit tests for pattern-matcher
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { PatternMatcher, clearPatternMatcher } from '../../../../src/core/pattern-matcher.js'
import type { InstrumentationConfig } from '../../../../src/core/instrumentation-schema.js'

describe('pattern-matcher', () => {
  beforeEach(() => {
    clearPatternMatcher()
  })

  describe('PatternMatcher', () => {
    it('should match instrument patterns', () => {
      const config: InstrumentationConfig = {
        version: '1.0',
        instrumentation: {
          enabled: true,
          instrument_patterns: [{ pattern: '^app\\.', enabled: true }],
          ignore_patterns: []
        }
      }

      const matcher = new PatternMatcher(config)

      expect(matcher.shouldInstrument('app.operation')).toBe(true)
      expect(matcher.shouldInstrument('app.user.login')).toBe(true)
      expect(matcher.shouldInstrument('other.operation')).toBe(true) // fail-open
    })

    it('should ignore patterns take precedence over instrument patterns', () => {
      const config: InstrumentationConfig = {
        version: '1.0',
        instrumentation: {
          enabled: true,
          instrument_patterns: [{ pattern: '^app\\.', enabled: true }],
          ignore_patterns: [{ pattern: '^app\\.health', enabled: true }]
        }
      }

      const matcher = new PatternMatcher(config)

      expect(matcher.shouldInstrument('app.operation')).toBe(true)
      expect(matcher.shouldInstrument('app.health')).toBe(false)
      expect(matcher.shouldInstrument('app.health.check')).toBe(false)
    })

    it('should fail-open when no patterns match', () => {
      const config: InstrumentationConfig = {
        version: '1.0',
        instrumentation: {
          enabled: true,
          instrument_patterns: [{ pattern: '^app\\.', enabled: true }],
          ignore_patterns: []
        }
      }

      const matcher = new PatternMatcher(config)

      // Patterns that don't match should still create spans (fail-open)
      expect(matcher.shouldInstrument('database.query')).toBe(true)
      expect(matcher.shouldInstrument('http.request')).toBe(true)
    })

    it('should respect global enabled flag', () => {
      const config: InstrumentationConfig = {
        version: '1.0',
        instrumentation: {
          enabled: false,
          instrument_patterns: [{ pattern: '^app\\.', enabled: true }],
          ignore_patterns: []
        }
      }

      const matcher = new PatternMatcher(config)

      // All patterns should be ignored when globally disabled
      expect(matcher.shouldInstrument('app.operation')).toBe(false)
      expect(matcher.shouldInstrument('anything')).toBe(false)
    })

    it('should skip disabled instrument patterns', () => {
      const config: InstrumentationConfig = {
        version: '1.0',
        instrumentation: {
          enabled: true,
          instrument_patterns: [
            { pattern: '^app\\.', enabled: true },
            { pattern: '^test\\.', enabled: false }
          ],
          ignore_patterns: []
        }
      }

      const matcher = new PatternMatcher(config)

      expect(matcher.shouldInstrument('app.operation')).toBe(true)
      // test. pattern is disabled, so it should fail-open to true
      expect(matcher.shouldInstrument('test.operation')).toBe(true)
    })

    it('should provide statistics', () => {
      const config: InstrumentationConfig = {
        version: '1.0',
        instrumentation: {
          enabled: true,
          instrument_patterns: [
            { pattern: '^app\\.', enabled: true },
            { pattern: '^http\\.', enabled: true },
            { pattern: '^test\\.', enabled: false }
          ],
          ignore_patterns: [
            { pattern: '^health\\.', enabled: true },
            { pattern: '^internal\\.', enabled: true }
          ]
        }
      }

      const matcher = new PatternMatcher(config)
      const stats = matcher.getStats()

      expect(stats.enabled).toBe(true)
      expect(stats.instrumentPatternCount).toBe(2) // Only enabled patterns
      expect(stats.ignorePatternCount).toBe(2)
    })
  })
})
