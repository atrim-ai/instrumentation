# @atrim/instrument-core

## 0.6.0

### Minor Changes

- 60e56c4: Remove unused Effect package overrides and resolve version mismatches
  - Removed pnpm overrides for unused `@effect/cluster`, `@effect/rpc`, and `@effect/sql` packages
  - Added `peerDependencyRules.ignoreMissing` to suppress peer dependency warnings
  - Allow pnpm to auto-resolve compatible versions for transitive Effect dependencies

## 0.5.0

### Minor Changes

- 8cc6b6a: Set all to the same 0.5.0 version to align with node and web packages functional
