import { describe, it, expect } from 'vitest'
import { formatAtrimMessage, isValidTenantId } from '../../../src/utils/message-formatter.js'

describe('message-formatter', () => {
  describe('formatAtrimMessage', () => {
    it('should format message with tenantId and traces', () => {
      const tenantId = 'test-tenant-123'
      const otlpData = { resourceSpans: [] }

      const result = formatAtrimMessage(tenantId, otlpData)
      const parsed = JSON.parse(result)

      expect(parsed).toEqual({
        tenantId: 'test-tenant-123',
        traces: { resourceSpans: [] }
      })
    })

    it('should handle complex OTLP data', () => {
      const tenantId = 'tenant-456'
      const otlpData = {
        resourceSpans: [
          {
            resource: { attributes: [{ key: 'service.name', value: 'test' }] },
            scopeSpans: [
              {
                spans: [{ name: 'test-span', spanId: '123', traceId: '456' }]
              }
            ]
          }
        ]
      }

      const result = formatAtrimMessage(tenantId, otlpData)
      const parsed = JSON.parse(result)

      expect(parsed.tenantId).toBe('tenant-456')
      expect(parsed.traces).toEqual(otlpData)
    })

    it('should return valid JSON string', () => {
      const result = formatAtrimMessage('tenant', { data: 'test' })
      expect(() => JSON.parse(result)).not.toThrow()
    })

    it('should handle empty OTLP data', () => {
      const result = formatAtrimMessage('tenant', {})
      const parsed = JSON.parse(result)

      expect(parsed).toEqual({
        tenantId: 'tenant',
        traces: {}
      })
    })
  })

  describe('isValidTenantId', () => {
    it('should accept valid alphanumeric tenant IDs', () => {
      expect(isValidTenantId('tenant123')).toBe(true)
      expect(isValidTenantId('Tenant123')).toBe(true)
      expect(isValidTenantId('TENANT123')).toBe(true)
      expect(isValidTenantId('123tenant')).toBe(true)
    })

    it('should accept tenant IDs with hyphens', () => {
      expect(isValidTenantId('tenant-123')).toBe(true)
      expect(isValidTenantId('my-tenant-id')).toBe(true)
      expect(isValidTenantId('tenant-')).toBe(true)
      expect(isValidTenantId('-tenant')).toBe(true)
    })

    it('should accept tenant IDs with underscores', () => {
      expect(isValidTenantId('tenant_123')).toBe(true)
      expect(isValidTenantId('my_tenant_id')).toBe(true)
      expect(isValidTenantId('tenant_')).toBe(true)
      expect(isValidTenantId('_tenant')).toBe(true)
    })

    it('should accept mixed alphanumeric with hyphens and underscores', () => {
      expect(isValidTenantId('my-tenant_123')).toBe(true)
      expect(isValidTenantId('Tenant-123_ABC')).toBe(true)
    })

    it('should reject empty strings', () => {
      expect(isValidTenantId('')).toBe(false)
    })

    it('should reject tenant IDs with spaces', () => {
      expect(isValidTenantId('tenant 123')).toBe(false)
      expect(isValidTenantId('my tenant')).toBe(false)
      expect(isValidTenantId(' tenant')).toBe(false)
      expect(isValidTenantId('tenant ')).toBe(false)
    })

    it('should reject tenant IDs with special characters', () => {
      expect(isValidTenantId('tenant@123')).toBe(false)
      expect(isValidTenantId('tenant.123')).toBe(false)
      expect(isValidTenantId('tenant#123')).toBe(false)
      expect(isValidTenantId('tenant$123')).toBe(false)
      expect(isValidTenantId('tenant/123')).toBe(false)
    })

    it('should reject non-string values', () => {
      expect(isValidTenantId(null as any)).toBe(false)
      expect(isValidTenantId(undefined as any)).toBe(false)
      expect(isValidTenantId(123 as any)).toBe(false)
      expect(isValidTenantId({} as any)).toBe(false)
      expect(isValidTenantId([] as any)).toBe(false)
    })
  })
})
