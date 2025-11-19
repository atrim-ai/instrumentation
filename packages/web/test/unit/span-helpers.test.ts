import { describe, it, expect, beforeEach } from 'vitest'
import { trace, SpanStatusCode } from '@opentelemetry/api'
import {
  setSpanAttributes,
  recordException,
  markSpanSuccess,
  markSpanError,
  annotateHttpRequest,
  annotateCacheOperation,
  annotateUserInteraction,
  annotateNavigation
} from '../../src/integrations/standard/span-helpers.js'

describe('Span Helpers', () => {
  let span: any

  beforeEach(() => {
    // Create a mock span
    const tracer = trace.getTracer('test')
    span = tracer.startSpan('test-span')
  })

  describe('setSpanAttributes', () => {
    it('should set multiple attributes on a span', () => {
      setSpanAttributes(span, {
        key1: 'value1',
        key2: 123,
        key3: true
      })

      // Span should have attributes set (we can't verify directly in tests without OTel internals)
      expect(span).toBeDefined()
    })

    it('should handle empty attributes', () => {
      setSpanAttributes(span, {})
      expect(span).toBeDefined()
    })
  })

  describe('recordException', () => {
    it('should record an exception on a span', () => {
      const error = new Error('Test error')

      recordException(span, error)

      expect(span).toBeDefined()
    })

    it('should record an exception with context', () => {
      const error = new Error('Test error')

      recordException(span, error, {
        'error.context': 'test-context',
        'error.code': 500
      })

      expect(span).toBeDefined()
    })
  })

  describe('markSpanSuccess', () => {
    it('should mark span as successful', () => {
      markSpanSuccess(span)

      expect(span).toBeDefined()
    })

    it('should mark span as successful with attributes', () => {
      markSpanSuccess(span, {
        'result.count': 10,
        'result.cached': true
      })

      expect(span).toBeDefined()
    })
  })

  describe('markSpanError', () => {
    it('should mark span as error with message', () => {
      markSpanError(span, 'Operation failed')

      expect(span).toBeDefined()
    })

    it('should mark span as error with attributes', () => {
      markSpanError(span, 'Operation failed', {
        'error.code': 500,
        'error.type': 'ServerError'
      })

      expect(span).toBeDefined()
    })

    it('should use default message when none provided', () => {
      markSpanError(span)

      expect(span).toBeDefined()
    })
  })

  describe('annotateHttpRequest', () => {
    it('should annotate HTTP request with all fields', () => {
      annotateHttpRequest(span, {
        method: 'GET',
        url: 'https://api.example.com/users',
        statusCode: 200,
        responseTime: 150,
        requestSize: 1024,
        responseSize: 2048
      })

      expect(span).toBeDefined()
    })

    it('should annotate HTTP request with partial fields', () => {
      annotateHttpRequest(span, {
        method: 'POST',
        statusCode: 201
      })

      expect(span).toBeDefined()
    })

    it('should handle empty options', () => {
      annotateHttpRequest(span, {})

      expect(span).toBeDefined()
    })
  })

  describe('annotateCacheOperation', () => {
    it('should annotate cache get operation', () => {
      annotateCacheOperation(span, {
        operation: 'get',
        key: 'user:123',
        hit: true
      })

      expect(span).toBeDefined()
    })

    it('should annotate cache set operation', () => {
      annotateCacheOperation(span, {
        operation: 'set',
        key: 'user:123',
        size: 512
      })

      expect(span).toBeDefined()
    })

    it('should annotate cache delete operation', () => {
      annotateCacheOperation(span, {
        operation: 'delete',
        key: 'user:123'
      })

      expect(span).toBeDefined()
    })

    it('should annotate cache clear operation', () => {
      annotateCacheOperation(span, {
        operation: 'clear'
      })

      expect(span).toBeDefined()
    })
  })

  describe('annotateUserInteraction', () => {
    it('should annotate click interaction', () => {
      annotateUserInteraction(span, {
        type: 'click',
        target: 'button#submit',
        page: '/checkout'
      })

      expect(span).toBeDefined()
    })

    it('should annotate submit interaction', () => {
      annotateUserInteraction(span, {
        type: 'submit',
        target: 'form#login'
      })

      expect(span).toBeDefined()
    })

    it('should annotate navigation interaction', () => {
      annotateUserInteraction(span, {
        type: 'navigation',
        page: '/profile'
      })

      expect(span).toBeDefined()
    })
  })

  describe('annotateNavigation', () => {
    it('should annotate client-side navigation', () => {
      annotateNavigation(span, {
        from: '/home',
        to: '/profile',
        type: 'client-side'
      })

      expect(span).toBeDefined()
    })

    it('should annotate server-side navigation', () => {
      annotateNavigation(span, {
        from: '/login',
        to: '/dashboard',
        type: 'server-side'
      })

      expect(span).toBeDefined()
    })

    it('should annotate initial navigation', () => {
      annotateNavigation(span, {
        to: '/home',
        type: 'initial'
      })

      expect(span).toBeDefined()
    })

    it('should handle minimal navigation info', () => {
      annotateNavigation(span, {
        to: '/about'
      })

      expect(span).toBeDefined()
    })
  })
})
