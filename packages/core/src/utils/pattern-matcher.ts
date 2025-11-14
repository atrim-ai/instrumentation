/**
 * Pattern matching utilities
 *
 * Implements efficient pattern-based span filtering with caching.
 *
 * Matching rules:
 * 1. Check ignore patterns first (takes precedence)
 * 2. Check instrument patterns second
 * 3. Default behavior: If no patterns match, span is created (fail-open)
 */

import type { InstrumentationConfig, PatternConfig } from '../schemas/instrumentation-schema.js'

/**
 * Compiled pattern with metadata
 */
interface CompiledPattern {
  regex: RegExp
  enabled: boolean
  description?: string
}

/**
 * Pattern matcher with compiled regex cache
 */
export class PatternMatcher {
  private ignorePatterns: CompiledPattern[] = []
  private instrumentPatterns: CompiledPattern[] = []
  private enabled: boolean = true

  constructor(config: InstrumentationConfig) {
    this.enabled = config.instrumentation.enabled

    // Compile ignore patterns (highest priority)
    this.ignorePatterns = config.instrumentation.ignore_patterns.map((p) => this.compilePattern(p))

    // Compile instrument patterns
    this.instrumentPatterns = config.instrumentation.instrument_patterns
      .filter((p) => p.enabled !== false) // Filter out disabled patterns
      .map((p) => this.compilePattern(p))
  }

  /**
   * Compile a pattern configuration into a RegExp
   */
  private compilePattern(pattern: PatternConfig): CompiledPattern {
    try {
      const compiled: CompiledPattern = {
        regex: new RegExp(pattern.pattern),
        enabled: pattern.enabled !== false
      }
      if (pattern.description !== undefined) {
        compiled.description = pattern.description
      }
      return compiled
    } catch (error) {
      throw new Error(
        `Failed to compile pattern "${pattern.pattern}": ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }

  /**
   * Check if a span should be instrumented
   *
   * Returns true if the span should be created, false otherwise.
   *
   * Logic:
   * 1. If instrumentation disabled globally, return false
   * 2. Check ignore patterns - if any match, return false
   * 3. Check instrument patterns - if any match, return true
   * 4. Default: return true (fail-open - create span if no patterns match)
   */
  shouldInstrument(spanName: string): boolean {
    // Global disable
    if (!this.enabled) {
      return false
    }

    // Check ignore patterns first (highest priority)
    for (const pattern of this.ignorePatterns) {
      if (pattern.regex.test(spanName)) {
        return false
      }
    }

    // Check instrument patterns
    for (const pattern of this.instrumentPatterns) {
      if (pattern.enabled && pattern.regex.test(spanName)) {
        return true
      }
    }

    // Default: fail-open (create span if no patterns match)
    // This ensures backward compatibility and doesn't break existing instrumentation
    return true
  }

  /**
   * Get statistics about pattern matching (for debugging/monitoring)
   */
  getStats(): {
    enabled: boolean
    ignorePatternCount: number
    instrumentPatternCount: number
  } {
    return {
      enabled: this.enabled,
      ignorePatternCount: this.ignorePatterns.length,
      instrumentPatternCount: this.instrumentPatterns.filter((p) => p.enabled).length
    }
  }
}

// Global pattern matcher instance
let globalMatcher: PatternMatcher | null = null

/**
 * Initialize the global pattern matcher
 */
export function initializePatternMatcher(config: InstrumentationConfig): void {
  globalMatcher = new PatternMatcher(config)
}

/**
 * Check if a span should be instrumented (uses global matcher)
 *
 * This is a convenience function for use without direct access to the matcher instance.
 * If no matcher is initialized, defaults to true (fail-open).
 */
export function shouldInstrumentSpan(spanName: string): boolean {
  if (!globalMatcher) {
    // No matcher initialized - fail open
    return true
  }
  return globalMatcher.shouldInstrument(spanName)
}

/**
 * Get the global pattern matcher (for advanced use cases)
 */
export function getPatternMatcher(): PatternMatcher | null {
  return globalMatcher
}

/**
 * Clear the global pattern matcher (useful for testing)
 */
export function clearPatternMatcher(): void {
  globalMatcher = null
}
