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
    noExternal: ['@atrim/instrument-core'],
    external: ['@opentelemetry/api', '@opentelemetry/sdk-trace-base']
  },
  // Effect integration (builds JS and DTS for proper type inference)
  {
    entry: {
      'integrations/effect/index': 'src/integrations/effect/index.ts'
    },
    format: ['esm', 'cjs'],
    dts: true, // Generate DTS for proper type inference
    splitting: false,
    sourcemap: true,
    clean: false, // Don't clean - main entry already did
    treeshake: true,
    minify: false,
    target: 'es2020',
    outDir: 'target/dist',
    tsconfig: 'tsconfig.build.json',
    noExternal: ['@atrim/instrument-core'],
    external: [
      'effect',
      '@effect/opentelemetry',
      '@effect/platform',
      '@opentelemetry/api',
      '@opentelemetry/sdk-trace-base'
    ]
  }
])
