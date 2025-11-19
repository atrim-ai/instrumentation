import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createOtlpExporter, getOtlpEndpoint } from '../../src/core/exporter-factory.js'

describe('Exporter Factory', () => {
  beforeEach(() => {
    // Clean up any window config
    if (typeof window !== 'undefined') {
      delete (window as any).OTEL_EXPORTER_OTLP_ENDPOINT
    }
  })

  afterEach(() => {
    // Clean up
    if (typeof window !== 'undefined') {
      delete (window as any).OTEL_EXPORTER_OTLP_ENDPOINT
    }
  })

  describe('createOtlpExporter', () => {
    it('should create an OTLP exporter with default endpoint', () => {
      const exporter = createOtlpExporter()

      expect(exporter).toBeDefined()
      // Exporter is created successfully - internal structure is not our concern
    })

    it('should create an OTLP exporter with custom endpoint', () => {
      const customEndpoint = 'http://custom:4318/v1/traces'
      const exporter = createOtlpExporter({
        endpoint: customEndpoint
      })

      expect(exporter).toBeDefined()
    })

    it('should create an OTLP exporter with custom headers', () => {
      const exporter = createOtlpExporter({
        headers: {
          Authorization: 'Bearer token123',
          'X-Custom-Header': 'value'
        }
      })

      expect(exporter).toBeDefined()
    })

    it('should create an OTLP exporter with custom timeout', () => {
      const exporter = createOtlpExporter({
        timeout: 5000
      })

      expect(exporter).toBeDefined()
    })
  })

  describe('getOtlpEndpoint', () => {
    it('should return default endpoint when no config is set', () => {
      const endpoint = getOtlpEndpoint()

      expect(endpoint).toBe('http://localhost:4318/v1/traces')
    })

    it('should return endpoint from window config', () => {
      const customEndpoint = 'http://window-config:4318/v1/traces'
      ;(window as any).OTEL_EXPORTER_OTLP_ENDPOINT = customEndpoint

      const endpoint = getOtlpEndpoint()

      expect(endpoint).toBe(customEndpoint)
    })

    it('should convert non-string values to strings', () => {
      ;(window as any).OTEL_EXPORTER_OTLP_ENDPOINT = 12345

      const endpoint = getOtlpEndpoint()

      expect(endpoint).toBe('12345')
    })
  })
})
