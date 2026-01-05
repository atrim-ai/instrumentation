import type { AtrimMessage } from '../types.js'

/**
 * Format OTLP data for Atrim backend
 */
export function formatAtrimMessage(tenantId: string, otlpData: unknown, apiKey?: string): string {
  const message: AtrimMessage = {
    tenantId,
    traces: otlpData
  }
  if (apiKey) {
    message.apiKey = apiKey
  }
  return JSON.stringify(message)
}

/**
 * Validate tenant ID format
 * Accepts alphanumeric characters, hyphens, and underscores
 */
export function isValidTenantId(tenantId: string): boolean {
  if (!tenantId || typeof tenantId !== 'string') {
    return false
  }
  // Non-empty string with alphanumeric + hyphens/underscores
  return /^[a-zA-Z0-9_-]+$/.test(tenantId)
}
