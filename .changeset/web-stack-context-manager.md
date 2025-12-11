---
"@atrim/instrument-web": patch
---

Use StackContextManager by default to avoid passive event listener issues with zone.js (e.g., in Angular apps). ZoneContextManager can still be explicitly enabled via `useZoneContextManager: true` option.
