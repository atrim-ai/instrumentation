# Contributing to @atrim/instrumentation

Thank you for your interest in contributing! This document provides guidelines for contributing to the project.

## Development Setup

### Prerequisites

- Node.js 18+ or Bun 1.0+
- pnpm (recommended) or npm

### Getting Started

```bash
# Clone the repository
git clone https://github.com/atrim-ai/instrumentation.git
cd instrumentation

# Install dependencies
pnpm install

# Run tests
pnpm test

# Type check
pnpm typecheck

# Lint
pnpm lint

# Build
pnpm build
```

## Development Workflow

1. **Create a feature branch** from `main`
2. **Make your changes** following our coding standards
3. **Write tests** for new functionality
4. **Run tests and linting** before committing
5. **Create a pull request** with a clear description

## Coding Standards

### TypeScript

- Use strict TypeScript settings (no `any` except where absolutely necessary)
- Follow existing code style (enforced by ESLint and Prettier)
- Write comprehensive JSDoc comments for public APIs

### Testing

- Unit tests required for all new functionality
- Integration tests for framework integrations
- Target: >80% code coverage

### Commits

Follow conventional commits format:

```
feat: add support for custom span processors
fix: handle YAML parsing errors gracefully
docs: update configuration examples
test: add integration tests for Bun runtime
```

## Project Structure

```
src/
├── core/              # Framework-agnostic core
├── integrations/      # Framework-specific integrations
│   ├── effect/       # Effect-TS integration (optional)
│   └── standard/     # Standard OpenTelemetry
├── api.ts            # Public API
└── index.ts          # Main entry point
```

### Key Principles

1. **Universal Design** - Core must work with any Node.js application
2. **No Required Framework Dependencies** - Effect is optional
3. **Performance First** - Target <5% overhead
4. **Security by Default** - Validate all inputs, rate limit remote requests

## Testing

### Running Tests

```bash
# All tests
pnpm test

# Watch mode
pnpm test:watch

# Coverage
pnpm test:coverage

# Specific test file
pnpm test pattern-matcher.test.ts
```

### Writing Tests

```typescript
import { describe, it, expect } from 'vitest'

describe('PatternMatcher', () => {
  it('should match patterns correctly', () => {
    // Arrange
    const pattern = '^app\\.'
    const spanName = 'app.operation'

    // Act
    const result = shouldMatch Span(spanName, pattern)

    // Assert
    expect(result).toBe(true)
  })
})
```

## Documentation

### Code Documentation

- All public APIs must have JSDoc comments
- Include usage examples in JSDoc
- Document edge cases and error conditions

### README Updates

Update README.md when:
- Adding new public APIs
- Changing configuration options
- Adding new framework integrations

## Pull Request Process

1. **Ensure tests pass** (`pnpm test`)
2. **Lint code** (`pnpm lint`)
3. **Type check** (`pnpm typecheck`)
4. **Update documentation** if needed
5. **Fill out PR template** with:
   - Description of changes
   - Related issues
   - Breaking changes (if any)
   - Testing performed

## Code Review

Pull requests require:
- At least one approval from a maintainer
- All CI checks passing
- No merge conflicts

## Release Process

Maintainers only:

1. Update version in `package.json`
2. Update `CHANGELOG.md`
3. Create git tag: `git tag v1.0.0`
4. Push tag: `git push origin v1.0.0`
5. CI will automatically publish to NPM

## Questions?

- Open an issue for bugs or feature requests
- Join our Discord for discussions (coming soon)
- Check existing issues before creating new ones

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
