# @atrim/instrument-core

**Internal package** - Shared platform-agnostic instrumentation logic.

This package contains the core functionality shared across all `@atrim/instrument-*` platform packages:

- Configuration loading (YAML/URL)
- Pattern matching and compilation
- Schema validation (Zod)
- Logging utilities

## Not for Direct Use

This package is **private** and not published to npm. It is automatically installed as a workspace dependency when you install any `@atrim/instrument-*` package.

## For Platform Package Developers

If you're building a new platform package (e.g., `@atrim/instrument-web`), you can depend on this package:

```json
{
  "dependencies": {
    "@atrim/instrument-core": "workspace:*"
  }
}
```

## License

MIT © Atrim AI
