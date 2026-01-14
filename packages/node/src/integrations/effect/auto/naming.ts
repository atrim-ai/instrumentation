/**
 * Span Name Inference for Auto-Tracing
 *
 * Provides intelligent span naming based on source code information
 * and configuration rules from instrumentation.yaml.
 */

import type { AutoInstrumentationConfig, SpanNamingRule } from '@atrim/instrument-core'
import * as path from 'path'

/**
 * Source code information extracted from stack traces
 */
export interface SourceInfo {
  /** Function name (or 'anonymous') */
  function: string
  /** Full file path */
  file: string
  /** Line number */
  line: number
  /** Column number */
  column: number
}

/**
 * Template variables available for span naming
 */
export interface TemplateVariables {
  fiber_id: string
  function: string
  module: string
  file: string
  line: string
  operator: string
  [key: string]: string
}

/**
 * Compiled naming rule with pre-compiled regex patterns
 */
interface CompiledNamingRule {
  original: SpanNamingRule
  filePattern: RegExp | undefined
  functionPattern: RegExp | undefined
  modulePattern: RegExp | undefined
}

// Cache for compiled naming rules
const compiledRulesCache = new WeakMap<SpanNamingRule[], CompiledNamingRule[]>()

/**
 * Compile naming rules for efficient matching
 */
function compileNamingRules(rules: SpanNamingRule[]): CompiledNamingRule[] {
  const cached = compiledRulesCache.get(rules)
  if (cached) return cached

  const compiled: CompiledNamingRule[] = rules.map((rule) => ({
    original: rule,
    filePattern: rule.match.file ? new RegExp(rule.match.file) : undefined,
    functionPattern: rule.match.function ? new RegExp(rule.match.function) : undefined,
    modulePattern: rule.match.module ? new RegExp(rule.match.module) : undefined
  }))

  compiledRulesCache.set(rules, compiled)
  return compiled
}

/**
 * Extract module name from file path
 */
function extractModuleName(filePath: string): string {
  const basename = path.basename(filePath, path.extname(filePath))
  // Remove common suffixes (both dot-separated and PascalCase)
  // e.g., "user.service" -> "user", "UserService" -> "User"
  return basename
    .replace(/\.(service|controller|handler|util|helper|model|repo|repository)$/i, '')
    .replace(/(Service|Controller|Handler|Util|Helper|Model|Repo|Repository)$/i, '')
}

/**
 * Apply template variables to a span name pattern
 *
 * Supports:
 * - {fiber_id} - Fiber ID
 * - {function} - Function name
 * - {module} - Module name (filename without extension)
 * - {file} - Full file path
 * - {line} - Line number
 * - {operator} - Effect operator (if known)
 * - {match:field:N} - Captured regex group from match
 */
function applyTemplate(
  template: string,
  variables: TemplateVariables,
  matchGroups?: Map<string, string[]>
): string {
  let result = template

  // Replace simple variables
  for (const [key, value] of Object.entries(variables)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value)
  }

  // Replace match groups: {match:field:N} where field is 'file', 'function', 'module'
  // and N is the capture group index
  if (matchGroups) {
    result = result.replace(
      /\{match:(\w+):(\d+)\}/g,
      (_fullMatch, field: string, index: string): string => {
        const groups = matchGroups.get(field)
        const idx = parseInt(index, 10)
        if (groups && groups[idx]) {
          return groups[idx]
        }
        return ''
      }
    )
  }

  return result
}

/**
 * Find matching naming rule for the given source info
 */
function findMatchingRule(
  sourceInfo: SourceInfo | undefined,
  config: AutoInstrumentationConfig
): { rule: CompiledNamingRule; matchGroups: Map<string, string[]> } | undefined {
  const rules = config.span_naming?.rules
  if (!rules || rules.length === 0) return undefined

  const compiledRules = compileNamingRules(rules)

  for (const rule of compiledRules) {
    const matchGroups = new Map<string, string[]>()
    let allMatched = true

    // Check file pattern
    if (rule.filePattern) {
      if (sourceInfo?.file) {
        const match = sourceInfo.file.match(rule.filePattern)
        if (match) {
          matchGroups.set('file', match.slice(1))
        } else {
          allMatched = false
        }
      } else {
        allMatched = false
      }
    }

    // Check function pattern
    if (rule.functionPattern && allMatched) {
      if (sourceInfo?.function) {
        const match = sourceInfo.function.match(rule.functionPattern)
        if (match) {
          matchGroups.set('function', match.slice(1))
        } else {
          allMatched = false
        }
      } else {
        allMatched = false
      }
    }

    // Check module pattern
    if (rule.modulePattern && allMatched) {
      const moduleName = sourceInfo?.file ? extractModuleName(sourceInfo.file) : ''
      if (moduleName) {
        const match = moduleName.match(rule.modulePattern)
        if (match) {
          matchGroups.set('module', match.slice(1))
        } else {
          allMatched = false
        }
      } else {
        allMatched = false
      }
    }

    if (allMatched) {
      return { rule, matchGroups }
    }
  }

  return undefined
}

/**
 * Infer a span name based on fiber ID, source info, and configuration
 *
 * Priority:
 * 1. Match against naming rules (first match wins)
 * 2. Use default template with source info if available
 * 3. Fallback to default template with fiber ID only
 *
 * Smart anonymous handling:
 * - When function is "anonymous", falls back to "module:line" format
 * - Example: "effect.index:42" instead of "effect.anonymous"
 *
 * @param fiberId - The fiber's numeric ID
 * @param sourceInfo - Optional source code information from stack trace
 * @param config - Auto-instrumentation configuration
 * @returns The inferred span name
 */
export function inferSpanName(
  fiberId: number,
  sourceInfo: SourceInfo | undefined,
  config: AutoInstrumentationConfig
): string {
  // Determine the best function name
  let functionName = sourceInfo?.function || 'anonymous'
  const moduleName = sourceInfo?.file ? extractModuleName(sourceInfo.file) : 'unknown'

  // If function is anonymous and we have source location, use module:line format
  if (functionName === 'anonymous' && sourceInfo?.file && sourceInfo?.line) {
    functionName = `${moduleName}:${sourceInfo.line}`
  }

  // Build template variables
  const variables: TemplateVariables = {
    fiber_id: String(fiberId),
    function: functionName,
    module: moduleName,
    file: sourceInfo?.file || 'unknown',
    line: sourceInfo?.line ? String(sourceInfo.line) : '0',
    operator: 'gen' // Default operator, could be enhanced with more context
  }

  // Try to match a naming rule
  const match = findMatchingRule(sourceInfo, config)
  if (match) {
    return applyTemplate(match.rule.original.name, variables, match.matchGroups)
  }

  // Use default template
  const defaultTemplate = config.span_naming?.default || 'effect.fiber.{fiber_id}'
  return applyTemplate(defaultTemplate, variables)
}

/**
 * Sanitize a span name to be OpenTelemetry compliant
 *
 * - Replaces invalid characters with underscores
 * - Ensures name is not empty
 * - Truncates to reasonable length
 */
export function sanitizeSpanName(name: string): string {
  if (!name) return 'effect.fiber.unknown'

  // Replace invalid characters (keep alphanumeric, dot, underscore, dash)
  let sanitized = name.replace(/[^a-zA-Z0-9._-]/g, '_')

  // Collapse multiple underscores
  sanitized = sanitized.replace(/_+/g, '_')

  // Remove leading/trailing underscores
  sanitized = sanitized.replace(/^_+|_+$/g, '')

  // Ensure not empty
  if (!sanitized) return 'effect.fiber.unknown'

  // Truncate to reasonable length (OTel has no strict limit, but 256 is reasonable)
  if (sanitized.length > 256) {
    sanitized = sanitized.substring(0, 256)
  }

  return sanitized
}
