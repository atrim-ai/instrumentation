/**
 * Centralized logging utility for @atrim/instrumentation
 *
 * Supports three levels:
 * - 'on' (default): All logging enabled
 * - 'minimal': Only a single initialization message + errors/warnings
 * - 'off': No logging at all
 */

export type LogLevel = 'on' | 'off' | 'minimal'

class Logger {
  private level: LogLevel = 'on'
  private hasLoggedMinimal = false

  /**
   * Set the logging level
   */
  setLevel(level: LogLevel): void {
    this.level = level
    this.hasLoggedMinimal = false
  }

  /**
   * Get the current logging level
   */
  getLevel(): LogLevel {
    return this.level
  }

  /**
   * Log a minimal initialization message (only shown once in minimal mode)
   */
  minimal(message: string): void {
    if (this.level === 'off') {
      return
    }

    if (this.level === 'minimal' && !this.hasLoggedMinimal) {
      console.log(message)
      this.hasLoggedMinimal = true
      return
    }

    if (this.level === 'on') {
      console.log(message)
    }
  }

  /**
   * Log an informational message
   */
  log(...args: unknown[]): void {
    if (this.level === 'on') {
      console.log(...args)
    }
  }

  /**
   * Log a warning message (shown in minimal mode)
   */
  warn(...args: unknown[]): void {
    if (this.level !== 'off') {
      console.warn(...args)
    }
  }

  /**
   * Log an error message (shown in minimal mode)
   */
  error(...args: unknown[]): void {
    if (this.level !== 'off') {
      console.error(...args)
    }
  }

  /**
   * Check if full logging is enabled
   */
  isEnabled(): boolean {
    return this.level === 'on'
  }

  /**
   * Check if minimal logging is enabled
   */
  isMinimal(): boolean {
    return this.level === 'minimal'
  }

  /**
   * Check if logging is completely disabled
   */
  isDisabled(): boolean {
    return this.level === 'off'
  }
}

// Singleton instance
export const logger = new Logger()
