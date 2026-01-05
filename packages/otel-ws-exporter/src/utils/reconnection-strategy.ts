import type { ReconnectionStrategy } from '../types.js'

/**
 * Exponential backoff reconnection strategy
 */
export class ExponentialBackoffStrategy implements ReconnectionStrategy {
  constructor(
    private initialDelayMs: number = 1000,
    private maxDelayMs: number = 30000,
    private maxAttempts: number = 5 // 0 = infinite
  ) {}

  /**
   * Calculate delay with exponential backoff
   */
  getDelay(attempt: number): number {
    const delay = this.initialDelayMs * Math.pow(2, attempt)
    return Math.min(delay, this.maxDelayMs)
  }

  /**
   * Check if should continue retrying
   */
  shouldRetry(attempt: number): boolean {
    if (this.maxAttempts === 0) {
      return true // Infinite retries
    }
    return attempt < this.maxAttempts
  }
}
