---
"@atrim/instrument-web": patch
---

fix: use StackContextManager by default to avoid passive event listener issues

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
