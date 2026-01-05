import { describe, it, expect } from 'vitest'
import { ExponentialBackoffStrategy } from '../../../src/utils/reconnection-strategy.js'

describe('ExponentialBackoffStrategy', () => {
  describe('getDelay', () => {
    it('should return initial delay for first attempt', () => {
      const strategy = new ExponentialBackoffStrategy(1000, 30000, 5)
      expect(strategy.getDelay(0)).toBe(1000)
    })

    it('should double delay for each subsequent attempt', () => {
      const strategy = new ExponentialBackoffStrategy(1000, 30000, 5)
      expect(strategy.getDelay(0)).toBe(1000)
      expect(strategy.getDelay(1)).toBe(2000)
      expect(strategy.getDelay(2)).toBe(4000)
      expect(strategy.getDelay(3)).toBe(8000)
    })

    it('should cap delay at maxDelayMs', () => {
      const strategy = new ExponentialBackoffStrategy(1000, 10000, 10)
      expect(strategy.getDelay(10)).toBe(10000) // 1024000 capped at 10000
      expect(strategy.getDelay(20)).toBe(10000) // Way over cap
    })

    it('should use custom initial delay', () => {
      const strategy = new ExponentialBackoffStrategy(500, 30000, 5)
      expect(strategy.getDelay(0)).toBe(500)
      expect(strategy.getDelay(1)).toBe(1000)
      expect(strategy.getDelay(2)).toBe(2000)
    })

    it('should use custom max delay', () => {
      const strategy = new ExponentialBackoffStrategy(1000, 5000, 10)
      expect(strategy.getDelay(5)).toBe(5000) // 32000 capped at 5000
    })
  })

  describe('shouldRetry', () => {
    it('should allow retries below max attempts', () => {
      const strategy = new ExponentialBackoffStrategy(1000, 30000, 5)
      expect(strategy.shouldRetry(0)).toBe(true)
      expect(strategy.shouldRetry(1)).toBe(true)
      expect(strategy.shouldRetry(4)).toBe(true)
    })

    it('should deny retries at or above max attempts', () => {
      const strategy = new ExponentialBackoffStrategy(1000, 30000, 5)
      expect(strategy.shouldRetry(5)).toBe(false)
      expect(strategy.shouldRetry(6)).toBe(false)
      expect(strategy.shouldRetry(100)).toBe(false)
    })

    it('should allow infinite retries when maxAttempts is 0', () => {
      const strategy = new ExponentialBackoffStrategy(1000, 30000, 0)
      expect(strategy.shouldRetry(0)).toBe(true)
      expect(strategy.shouldRetry(100)).toBe(true)
      expect(strategy.shouldRetry(1000)).toBe(true)
    })

    it('should use default maxAttempts of 5', () => {
      const strategy = new ExponentialBackoffStrategy()
      expect(strategy.shouldRetry(4)).toBe(true)
      expect(strategy.shouldRetry(5)).toBe(false)
    })
  })

  describe('default values', () => {
    it('should use default values when not provided', () => {
      const strategy = new ExponentialBackoffStrategy()
      expect(strategy.getDelay(0)).toBe(1000) // default initialDelayMs
      expect(strategy.getDelay(20)).toBe(30000) // default maxDelayMs
      expect(strategy.shouldRetry(4)).toBe(true) // default maxAttempts
      expect(strategy.shouldRetry(5)).toBe(false)
    })
  })
})
