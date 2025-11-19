import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    open: true
  },
  define: {
    // Expose OTLP endpoint at build time
    'import.meta.env.VITE_OTEL_EXPORTER_OTLP_ENDPOINT': JSON.stringify(
      process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318/v1/traces'
    ),
    'import.meta.env.VITE_OTEL_SERVICE_NAME': JSON.stringify(
      process.env.OTEL_SERVICE_NAME || 'atrim-platform-ui'
    )
  }
})
