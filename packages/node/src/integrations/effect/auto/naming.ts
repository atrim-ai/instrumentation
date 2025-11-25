/**
 * Span Naming System for Auto-Tracing
 *
 * Resolves span names from templates based on call context and configuration rules.
 *
 * Template variables:
 * - {operator} - Effect operator name (gen, all, forEach, etc.)
 * - {function} - Enclosing function name
 * - {module} - Module/file name without extension
 * - {file} - Full file path
 * - {line} - Line number
 * - {class} - Class name if in a method
 * - {match:N} - Captured group from regex match
 */

import type { SpanNamingRule } from '@atrim/instrument-core'

/**
 * Context information for span naming
 */
export interface SpanNamingContext {
  /** Effect operator name (gen, all, forEach, etc.) */
  operator: string
  /** Enclosing function name */
  function?: string
  /** Module/file name without extension */
  module?: string
  /** Full file path */
  file?: string
  /** Line number */
  line?: number
  /** Class name if in a method */
  class?: string
  /** Call stack string */
  stack?: string
  /** Fiber annotations */
  annotations?: Map<string, unknown>
}

/**
 * Span naming configuration
 */
export interface SpanNamingConfig {
  /** Default template when no rules match */
  default: string
  /** Custom naming rules */
  rules: SpanNamingRule[]
}

/**
 * Result of template resolution with any captured groups
 */
interface MatchResult {
  matched: boolean
  captures: Map<string, string>
}

/**
 * Parse call stack to extract context information
 *
 * @param maxDepth - Maximum frames to search
 * @returns Context extracted from stack
 */
export function parseCallStack(maxDepth: number = 15): SpanNamingContext {
  const error = new Error()
  const stack = error.stack || ''

  const context: SpanNamingContext = {
    operator: 'effect',
    stack
  }

  const lines = stack.split('\n')

  // Patterns to skip (internal frames)
  const skipPatterns = [
    /node_modules/,
    /at parseCallStack/,
    /at resolveSpanName/,
    /at autoTrace/,
    /at Effect\.gen/,
    /at Generator\.next/,
    /at __awaiter/,
    /at new Promise/,
    /^Error$/,
    /at Object\.<anonymous>/,
    /at Module\._compile/,
    /at processTicksAndRejections/,
    /internal\//
  ]

  let framesChecked = 0

  for (const line of lines) {
    if (framesChecked >= maxDepth) break

    // Skip if matches any skip pattern
    if (skipPatterns.some((pattern) => pattern.test(line))) {
      continue
    }

    framesChecked++

    // Try to extract class.method format
    // Format: "    at ClassName.methodName (file:line:col)"
    const classMethodMatch = line.match(/at\s+(\w+)\.(\w+)\s+\(([^)]+):(\d+):\d+\)/)
    if (classMethodMatch && classMethodMatch[1] && classMethodMatch[2]) {
      const className = classMethodMatch[1]
      const methodName = classMethodMatch[2]

      if (!['Object', 'Module', 'Function'].includes(className)) {
        context.class = className
        context.function = methodName
        if (classMethodMatch[3]) {
          context.file = classMethodMatch[3]
          context.module = extractModuleName(classMethodMatch[3])
        }
        if (classMethodMatch[4]) {
          context.line = parseInt(classMethodMatch[4], 10)
        }
        break
      }
    }

    // Try to extract function name
    // Format: "    at functionName (file:line:col)"
    const functionMatch = line.match(/at\s+(\w+)\s+\(([^)]+):(\d+):\d+\)/)
    if (functionMatch && functionMatch[1]) {
      const name = functionMatch[1]
      if (!['anonymous', 'eval', 'Object', 'Module'].includes(name)) {
        context.function = name
        if (functionMatch[2]) {
          context.file = functionMatch[2]
          context.module = extractModuleName(functionMatch[2])
        }
        if (functionMatch[3]) {
          context.line = parseInt(functionMatch[3], 10)
        }
        break
      }
    }

    // Fallback: extract file:line without function name
    const fileMatch = line.match(/\(([^)]+):(\d+):\d+\)/)
    if (fileMatch && fileMatch[1] && fileMatch[2]) {
      context.file = fileMatch[1]
      context.line = parseInt(fileMatch[2], 10)
      context.module = extractModuleName(fileMatch[1])
      // Don't break - continue looking for function name
    }
  }

  return context
}

/**
 * Extract module name from file path
 */
function extractModuleName(filePath: string): string {
  const parts = filePath.split('/')
  const fileName = parts[parts.length - 1] || 'unknown'
  return fileName.replace(/\.[^.]+$/, '')
}

/**
 * Check if a rule matches the given context
 *
 * @param rule - Naming rule to check
 * @param context - Call context
 * @returns Match result with any captured groups
 */
function matchRule(rule: SpanNamingRule, context: SpanNamingContext): MatchResult {
  const captures = new Map<string, string>()
  const match = rule.match

  // Check file pattern
  if (match.file) {
    if (!context.file) return { matched: false, captures }
    const regex = new RegExp(match.file)
    const result = regex.exec(context.file)
    if (!result) return { matched: false, captures }
    // Store captured groups
    result.forEach((value, index) => {
      if (index > 0 && value) {
        captures.set(`match:${index}`, value)
      }
    })
  }

  // Check function pattern
  if (match.function) {
    if (!context.function) return { matched: false, captures }
    const regex = new RegExp(match.function)
    const result = regex.exec(context.function)
    if (!result) return { matched: false, captures }
    // Store captured groups
    result.forEach((value, index) => {
      if (index > 0 && value) {
        captures.set(`match:${index}`, value)
      }
    })
  }

  // Check operator pattern
  if (match.operator) {
    const regex = new RegExp(match.operator)
    if (!regex.test(context.operator)) return { matched: false, captures }
  }

  // Check stack pattern
  if (match.stack) {
    if (!context.stack) return { matched: false, captures }
    const regex = new RegExp(match.stack)
    const result = regex.exec(context.stack)
    if (!result) return { matched: false, captures }
    // Store captured groups
    result.forEach((value, index) => {
      if (index > 0 && value) {
        captures.set(`match:${index}`, value)
      }
    })
  }

  // Check annotation
  if (match.annotation) {
    if (!context.annotations?.has(match.annotation)) {
      return { matched: false, captures }
    }
    const value = context.annotations.get(match.annotation)
    if (value !== undefined) {
      captures.set(`annotation:${match.annotation}`, String(value))
    }
  }

  return { matched: true, captures }
}

/**
 * Apply template substitution
 *
 * @param template - Name template with {variables}
 * @param context - Call context
 * @param captures - Captured regex groups
 * @returns Resolved span name
 */
function applyTemplate(
  template: string,
  context: SpanNamingContext,
  captures: Map<string, string>
): string {
  let result = template

  // Replace standard variables
  result = result.replace(/\{operator\}/g, context.operator)
  result = result.replace(/\{function\}/g, context.function || 'anonymous')
  result = result.replace(/\{module\}/g, context.module || 'unknown')
  result = result.replace(/\{file\}/g, context.file || 'unknown')
  result = result.replace(/\{line\}/g, String(context.line || 0))
  result = result.replace(/\{class\}/g, context.class || '')

  // Replace captured groups {match:N}
  for (const [key, value] of captures) {
    result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value)
  }

  // Clean up any unreplaced variables
  result = result.replace(/\{[^}]+\}/g, '')

  // Clean up empty segments (e.g., "foo..bar" -> "foo.bar")
  result = result.replace(/\.+/g, '.')
  result = result.replace(/^\.+|\.+$/g, '')

  return result || 'effect.operation'
}

/**
 * Resolve span name from configuration and context
 *
 * @param config - Span naming configuration
 * @param context - Call context
 * @returns Resolved span name
 */
export function resolveSpanName(config: SpanNamingConfig, context: SpanNamingContext): string {
  // Try each rule in order
  for (const rule of config.rules) {
    const matchResult = matchRule(rule, context)
    if (matchResult.matched) {
      return applyTemplate(rule.name, context, matchResult.captures)
    }
  }

  // Use default template
  return applyTemplate(config.default, context, new Map())
}

/**
 * Create a span name resolver function
 *
 * @param config - Span naming configuration
 * @returns Function that resolves span names
 */
export function createSpanNameResolver(
  config: SpanNamingConfig
): (operator: string, contextOverrides?: Partial<SpanNamingContext>) => string {
  return (operator: string, contextOverrides?: Partial<SpanNamingContext>) => {
    const context = {
      ...parseCallStack(),
      operator,
      ...contextOverrides
    }
    return resolveSpanName(config, context)
  }
}
