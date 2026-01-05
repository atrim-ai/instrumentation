---
"@atrim/instrument-node": minor
"@atrim/instrument-core": minor
"@atrim/instrument-web": minor
---

Remove unused Effect package overrides and resolve version mismatches

- Removed pnpm overrides for unused `@effect/cluster`, `@effect/rpc`, and `@effect/sql` packages
- Added `peerDependencyRules.ignoreMissing` to suppress peer dependency warnings
- Allow pnpm to auto-resolve compatible versions for transitive Effect dependencies
