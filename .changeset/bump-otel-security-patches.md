---
"@atrim/instrument-node": minor
---

Bump OpenTelemetry dependencies to their latest coherent, patched set to clear
downstream security alerts:

- `@opentelemetry/sdk-node`, `@opentelemetry/instrumentation`,
  `@opentelemetry/exporter-trace-otlp-http`, `@opentelemetry/sdk-logs`:
  `^0.208.0` → `^0.220.0`
- `@opentelemetry/auto-instrumentations-node`: `^0.67.3` → `^0.78.0`
- `@opentelemetry/resources`, `@opentelemetry/sdk-trace-base`,
  `@opentelemetry/sdk-trace-node`, `@opentelemetry/sdk-trace-web`,
  `@opentelemetry/sdk-metrics`: `^2.2.0` → `^2.9.0`

This raises the transitive `@opentelemetry/core` to `2.9.0` (≥ 2.8.0) and pulls
`@opentelemetry/exporter-prometheus` to `0.220.0`, resolving the high/medium
Dependabot advisories that consumers pinned through this package.

`@opentelemetry/auto-instrumentations-node` dropped Fastify from its bundled
instrumentations in 0.75+, so Fastify is now registered explicitly via the
standalone `@opentelemetry/instrumentation-fastify` package to preserve
out-of-the-box Fastify auto-instrumentation.
