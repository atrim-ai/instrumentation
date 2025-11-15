import { defineConfig } from 'tsup'

export default defineConfig([
  // Main entry (always builds with DTS)
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
    external: ['@atrim/instrument-core', '@opentelemetry/api', '@opentelemetry/sdk-trace-base']
  },
  // Effect integration (builds JS but skips DTS if Effect not installed)
  {
    entry: {
      'integrations/effect/index': 'src/integrations/effect/index.ts'
    },
    format: ['esm', 'cjs'],
    dts: false, // Skip DTS - Effect users will have types from their Effect installation
    splitting: false,
    sourcemap: true,
    clean: false, // Don't clean - main entry already did
    treeshake: true,
    minify: false,
    target: 'es2020',
    outDir: 'target/dist',
    tsconfig: 'tsconfig.build.json',
    external: [
      '@atrim/instrument-core',
      'effect',
      '@effect/opentelemetry',
      '@effect/platform',
      '@opentelemetry/api',
      '@opentelemetry/sdk-trace-base'
    ]
  }
])
