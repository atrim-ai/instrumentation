/**
 * Service Detection Utilities
 *
 * Auto-detects service name and version from environment variables and package.json
 */

import { readFile } from 'fs/promises'
import { join } from 'path'

export interface ServiceInfo {
  name: string
  version?: string | undefined
}

/**
 * Detect service name and version
 *
 * Priority order:
 * 1. OTEL_SERVICE_NAME environment variable
 * 2. package.json name field
 * 3. Fallback to 'unknown-service'
 *
 * Version:
 * 1. OTEL_SERVICE_VERSION environment variable
 * 2. package.json version field
 * 3. undefined (not set)
 */
export async function detectServiceInfo(): Promise<ServiceInfo> {
  // Try environment variables first
  const envServiceName = process.env.OTEL_SERVICE_NAME
  const envServiceVersion = process.env.OTEL_SERVICE_VERSION

  if (envServiceName) {
    return {
      name: envServiceName,
      version: envServiceVersion
    }
  }

  // Try package.json
  try {
    const packageJsonPath = join(process.cwd(), 'package.json')
    const packageJsonContent = await readFile(packageJsonPath, 'utf-8')
    const packageJson = JSON.parse(packageJsonContent) as {
      name?: string
      version?: string
    }

    if (packageJson.name) {
      return {
        name: packageJson.name,
        version: envServiceVersion || packageJson.version
      }
    }
  } catch {
    // package.json not found or invalid - use fallback
  }

  // Fallback
  return {
    name: 'unknown-service',
    version: envServiceVersion
  }
}

/**
 * Get service name with fallback
 */
export async function getServiceName(): Promise<string> {
  const info = await detectServiceInfo()
  return info.name
}

/**
 * Get service version if available
 */
export async function getServiceVersion(): Promise<string | undefined> {
  const info = await detectServiceInfo()
  return info.version
}
