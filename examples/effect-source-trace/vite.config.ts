import { defineConfig } from 'vite'
import effectPlugin from '@clayroach/unplugin/vite'

export default defineConfig({
  plugins: [
    effectPlugin({
      sourceTrace: true, // Inject source locations into yield* _() for logging
      spanTrace: true // Inject code.* attributes into Effect.withSpan() for tracing
    })
  ],
  build: {
    // Build as a Node.js library, not a browser app
    lib: {
      entry: 'src/index.ts',
      formats: ['es'],
      fileName: 'index'
    },
    rollupOptions: {
      // Mark dependencies as external
      external: [
        'effect',
        '@effect/opentelemetry',
        '@opentelemetry/api',
        '@opentelemetry/exporter-trace-otlp-http',
        '@opentelemetry/sdk-trace-base',
        '@atrim/instrument-node',
        '@atrim/instrument-node/effect/auto'
      ]
    },
    // Output to dist/
    outDir: 'dist',
    // Don't minify for readability
    minify: false
  }
})
