/**
 * Unit tests for span naming system
 */

import { describe, it, expect } from 'vitest'
import {
  resolveSpanName,
  createSpanNameResolver,
  type SpanNamingConfig,
  type SpanNamingContext
} from '../../../../src/integrations/effect/auto/naming.js'

describe('Span Naming System', () => {
  describe('resolveSpanName', () => {
    it('should use default template when no rules match', () => {
      const config: SpanNamingConfig = {
        default: 'effect.{operator}',
        rules: []
      }

      const context: SpanNamingContext = {
        operator: 'gen',
        function: 'fetchUsers',
        module: 'users',
        file: '/src/users.ts',
        line: 42
      }

      const name = resolveSpanName(config, context)
      expect(name).toBe('effect.gen')
    })

    it('should apply template with function variable', () => {
      const config: SpanNamingConfig = {
        default: '{module}.{function}',
        rules: []
      }

      const context: SpanNamingContext = {
        operator: 'gen',
        function: 'fetchUsers',
        module: 'users'
      }

      const name = resolveSpanName(config, context)
      expect(name).toBe('users.fetchUsers')
    })

    it('should apply template with all variables', () => {
      const config: SpanNamingConfig = {
        default: '{module}.{function}.{operator}',
        rules: []
      }

      const context: SpanNamingContext = {
        operator: 'all',
        function: 'processItems',
        module: 'processor'
      }

      const name = resolveSpanName(config, context)
      expect(name).toBe('processor.processItems.all')
    })

    it('should handle missing variables gracefully', () => {
      const config: SpanNamingConfig = {
        default: '{module}.{function}',
        rules: []
      }

      const context: SpanNamingContext = {
        operator: 'gen'
        // function and module are undefined
      }

      const name = resolveSpanName(config, context)
      expect(name).toBe('unknown.anonymous')
    })

    it('should match rule by file pattern', () => {
      const config: SpanNamingConfig = {
        default: 'effect.{operator}',
        rules: [
          {
            match: { file: 'src/services/.*' },
            name: 'service.{function}'
          }
        ]
      }

      const context: SpanNamingContext = {
        operator: 'gen',
        function: 'getUser',
        file: 'src/services/user-service.ts'
      }

      const name = resolveSpanName(config, context)
      expect(name).toBe('service.getUser')
    })

    it('should match rule by function pattern', () => {
      const config: SpanNamingConfig = {
        default: 'effect.{operator}',
        rules: [
          {
            match: { function: 'fetch.*' },
            name: 'http.{function}'
          }
        ]
      }

      const context: SpanNamingContext = {
        operator: 'tryPromise',
        function: 'fetchUsers'
      }

      const name = resolveSpanName(config, context)
      expect(name).toBe('http.fetchUsers')
    })

    it('should match rule by operator', () => {
      const config: SpanNamingConfig = {
        default: '{function}',
        rules: [
          {
            match: { operator: 'all' },
            name: 'parallel.{function}'
          }
        ]
      }

      const context: SpanNamingContext = {
        operator: 'all',
        function: 'processAll'
      }

      const name = resolveSpanName(config, context)
      expect(name).toBe('parallel.processAll')
    })

    it('should capture regex groups', () => {
      const config: SpanNamingConfig = {
        default: 'effect.{operator}',
        rules: [
          {
            match: { function: 'fetch(.*)' },
            name: 'http.fetch.{match:1}'
          }
        ]
      }

      const context: SpanNamingContext = {
        operator: 'tryPromise',
        function: 'fetchUsers'
      }

      const name = resolveSpanName(config, context)
      expect(name).toBe('http.fetch.Users')
    })

    it('should apply first matching rule', () => {
      const config: SpanNamingConfig = {
        default: 'default',
        rules: [
          {
            match: { function: 'fetch.*' },
            name: 'first.match'
          },
          {
            match: { operator: 'tryPromise' },
            name: 'second.match'
          }
        ]
      }

      const context: SpanNamingContext = {
        operator: 'tryPromise',
        function: 'fetchUsers'
      }

      const name = resolveSpanName(config, context)
      expect(name).toBe('first.match')
    })

    it('should fall through when rule does not match', () => {
      const config: SpanNamingConfig = {
        default: 'default.{operator}',
        rules: [
          {
            match: { function: 'save.*' },
            name: 'write.{function}'
          }
        ]
      }

      const context: SpanNamingContext = {
        operator: 'gen',
        function: 'fetchUsers'
      }

      const name = resolveSpanName(config, context)
      expect(name).toBe('default.gen')
    })

    it('should handle class.method naming', () => {
      const config: SpanNamingConfig = {
        default: '{class}.{function}',
        rules: []
      }

      const context: SpanNamingContext = {
        operator: 'gen',
        class: 'UserService',
        function: 'getById'
      }

      const name = resolveSpanName(config, context)
      expect(name).toBe('UserService.getById')
    })

    it('should clean up empty segments', () => {
      const config: SpanNamingConfig = {
        default: '{class}.{function}',
        rules: []
      }

      const context: SpanNamingContext = {
        operator: 'gen',
        // class is undefined
        function: 'standalone'
      }

      const name = resolveSpanName(config, context)
      expect(name).toBe('standalone')
    })
  })

  describe('createSpanNameResolver', () => {
    it('should create a resolver function', () => {
      const config: SpanNamingConfig = {
        default: 'effect.{operator}',
        rules: []
      }

      const resolver = createSpanNameResolver(config)
      expect(typeof resolver).toBe('function')
    })

    it('should resolve names with context overrides', () => {
      const config: SpanNamingConfig = {
        default: '{module}.{function}',
        rules: []
      }

      const resolver = createSpanNameResolver(config)
      const name = resolver('gen', {
        function: 'customFunction',
        module: 'customModule'
      })

      expect(name).toBe('customModule.customFunction')
    })
  })

  describe('Template edge cases', () => {
    it('should handle file:line format', () => {
      const config: SpanNamingConfig = {
        default: '{file}:{line}',
        rules: []
      }

      const context: SpanNamingContext = {
        operator: 'gen',
        file: 'src/app.ts',
        line: 42
      }

      const name = resolveSpanName(config, context)
      expect(name).toBe('src/app.ts:42')
    })

    it('should return fallback for empty result', () => {
      const config: SpanNamingConfig = {
        default: '{nonexistent}',
        rules: []
      }

      const context: SpanNamingContext = {
        operator: 'gen'
      }

      const name = resolveSpanName(config, context)
      expect(name).toBe('effect.operation')
    })

    it('should handle multiple capture groups', () => {
      const config: SpanNamingConfig = {
        default: 'default',
        rules: [
          {
            match: { file: 'src/(\\w+)/(\\w+)\\.ts' },
            name: '{match:1}.{match:2}'
          }
        ]
      }

      const context: SpanNamingContext = {
        operator: 'gen',
        file: 'src/services/users.ts'
      }

      const name = resolveSpanName(config, context)
      expect(name).toBe('services.users')
    })
  })
})
