/**
 * Browser configuration loader using Effect Platform
 *
 * NOTE: Temporarily disabled for Effect 4.x migration
 * The web package will need updates for Effect 4.x similar to the node package.
 */

import { defaultConfig, type InstrumentationConfig } from '@atrim/instrument-core'

/**
 * Temporarily stubbed for Effect 4.x migration
 */
export async function loadConfig(_uri: string): Promise<InstrumentationConfig> {
  return defaultConfig
}

/**
 * Temporarily stubbed for Effect 4.x migration
 */
export async function loadConfigFromInline(
  _content: string | unknown
): Promise<InstrumentationConfig> {
  return defaultConfig
}

/**
 * Temporarily disabled for Effect 4.x migration
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const WebConfigLoaderLive = null as any
