# @atrim/instrument-web

## 0.5.3

### Patch Changes

- 1c426c1: Use StackContextManager by default to avoid passive event listener issues with zone.js (e.g., in Angular apps). ZoneContextManager can still be explicitly enabled via `useZoneContextManager: true` option.

## 0.5.2

### Patch Changes

- acf1a93: fix: use StackContextManager by default to avoid passive event listener issues

  Zone.js monkey-patches event listeners and can register wheel/touch events as passive by default, which breaks libraries that call `preventDefault()` on these events (e.g., Monaco Editor, CodeMirror, Leaflet).

  **Changes:**
  - Default to `StackContextManager` (lightweight, no side effects)
  - Add `useZoneContext` option to opt-in to Zone.js when needed
  - When Zone.js is enabled, configure `__zone_symbol__PASSIVE_EVENTS` to disable passive events
  - Make `@opentelemetry/context-zone` an optional peer dependency
  - Dynamically import Zone.js only when `useZoneContext: true`

  **Migration:** If you need Zone.js context propagation, add `useZoneContext: true`:

  ```typescript
  await initializeInstrumentation({
    serviceName: 'my-app',
    useZoneContext: true
  })
  ```

## 0.5.1

### Patch Changes

- c9cca11: Add configurable trace context propagation with CORS guidance

## 0.5.0

### Minor Changes

- 8cc6b6a: Set all to the same 0.5.0 version to align with node and web packages functional
