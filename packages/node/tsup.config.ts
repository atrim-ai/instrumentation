import { defineConfig } from 'tsup'

// Packages that MUST be external (singleton or user-provided)
const externalPackages = [
  // OpenTelemetry API - global singleton, MUST be shared with user's app
  '@opentelemetry/api',

  // OpenTelemetry SDK packages - keep as regular dependencies, not bundled
  // They have internal requires to @opentelemetry/api that break if bundled
  '@opentelemetry/sdk-node',
  '@opentelemetry/sdk-trace-base',
  '@opentelemetry/sdk-trace-node',
  '@opentelemetry/exporter-trace-otlp-http',
  '@opentelemetry/auto-instrumentations-node',
  '@opentelemetry/instrumentation',
  '@opentelemetry/resources',
  '@opentelemetry/semantic-conventions',

  // Effect ecosystem - user provides their own versions
  'effect',
  '@effect/opentelemetry',
  '@effect/platform',
  '@effect/platform-node'
]

export default defineConfig([
  // Main entry
  {
    entry: {
      index: 'src/index.ts'
    },
    format: ['esm', 'cjs'],
    dts: true,
    splitting: false,
    sourcemap: true,
    clean: true,
    treeshake: true,
    minify: false,
    target: 'es2020',
    outDir: 'target/dist',
    tsconfig: 'tsconfig.build.json',
    external: externalPackages,
    noExternal: ['@atrim/instrument-core']
  },
  // Effect integration
  {
    entry: {
      'integrations/effect/index': 'src/integrations/effect/index.ts'
    },
    format: ['esm', 'cjs'],
    dts: true,
    splitting: false,
    sourcemap: true,
    clean: false, // Don't clean - main entry already did
    treeshake: true,
    minify: false,
    target: 'es2020',
    outDir: 'target/dist',
    tsconfig: 'tsconfig.build.json',
    external: externalPackages,
    noExternal: ['@atrim/instrument-core']
  }
])
