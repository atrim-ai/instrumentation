# Publishing Guide

This document explains how to publish packages from the `@atrim/instrumentation` monorepo.

## Local Development Registry

For testing packages locally without publishing to npm, use the built-in Verdaccio registry.

### Quick Start

```bash
# Start local registry (http://localhost:4873)
pnpm registry:start

# Publish all packages to local registry
pnpm publish:local

# Use in another project
npm config set @atrim:registry http://localhost:4873
npm install @atrim/instrumentation
```

### Managing Local Registry

```bash
# View logs
pnpm registry:logs

# Stop registry (keeps data)
pnpm registry:stop

# Start again (data persists)
pnpm registry:start
```

See [tools/verdaccio/README.md](tools/verdaccio/README.md) for detailed instructions.

## Publishing to npm

### Prerequisites

1. **npm account**: Access to `@atrim` scope on npm
2. **npm token**: Configure `NPM_TOKEN` secret in GitHub (for CI)
3. **Local auth**: Run `npm login` for manual publishing

### Manual Publishing

#### 1. Local Registry (Recommended for Testing)

Test your package locally before publishing to npm:

```bash
# Start Verdaccio
pnpm registry:start

# Build and publish to local registry
pnpm build
pnpm publish:local

# Test in another project
cd /path/to/test-project
npm config set @atrim:registry http://localhost:4873
npm install @atrim/instrumentation-node
```

#### 2. Dry Run

Test what will be published without actually publishing:

```bash
pnpm run publish:dry-run
```

#### 3. Snapshot Release

Publish a snapshot/prerelease version for testing on npm:

```bash
# Bumps to 0.1.0-SNAPSHOT.0 (or next prerelease)
pnpm run publish:snapshot
```

Install snapshots with:

```bash
npm install @atrim/instrumentation-node@snapshot
```

#### 4. Production Release

```bash
# Update version in package.json, then:
pnpm run publish:public

# Or bump and publish:
pnpm version patch  # or minor, major
pnpm run publish:public
```

### GitHub Actions Publishing

Use the "Publish to npm" workflow:

1. Go to **Actions** → **Publish to npm**
2. Click **Run workflow**
3. Select:
   - **dry-run**: Test without publishing
   - **snapshot**: Publish as `@snapshot` tag
   - **release**: Production release

For releases, optionally specify version (e.g., `0.2.0`, `1.0.0-beta.1`).

## Version Conventions

- **Production**: `0.1.0`, `0.2.0`, `1.0.0`
- **Beta**: `0.2.0-beta.1`, `1.0.0-beta.2`
- **Snapshot**: `0.1.0-SNAPSHOT.0`, `0.1.0-SNAPSHOT.1`

## Pre-publish Checklist

- [ ] All tests pass (`pnpm test`)
- [ ] Integration tests pass (`pnpm test:integration`)
- [ ] Build succeeds (`pnpm build`)
- [ ] Type checking passes (`pnpm typecheck`)
- [ ] Linting passes (`pnpm lint`)
- [ ] CHANGELOG.md updated
- [ ] README.md up to date
- [ ] Version follows semver
- [ ] Tested locally via Verdaccio

## Workflow Comparison

| Method | Use Case | Registry | Persistence |
|--------|----------|----------|-------------|
| Local Verdaccio | Quick local testing | `localhost:4873` | Docker volume |
| Dry Run | Check package contents | None | No publish |
| Snapshot | Alpha testing with team | `registry.npmjs.org` | Yes (public) |
| Release | Production | `registry.npmjs.org` | Yes (public) |

## Tarball Generation

Create a tarball without publishing:

```bash
pnpm pack
```

Creates `atrim-instrumentation-{version}.tgz`:

```bash
npm install /path/to/atrim-instrumentation-{version}.tgz
```

## CI/CD Integration

CI automatically:
- Builds and tests on every push
- Creates package tarballs (30-day retention)
- Validates installation

Download tarballs from:
**Actions** → **CI** → Select run → **Artifacts** → **npm-package**

## Troubleshooting

### Local Registry Not Running

```bash
docker compose ps
docker compose up -d
```

### Authentication Issues

```bash
# For local registry
npm adduser --registry http://localhost:4873

# For npm
npm login
npm whoami
```

### Version Conflicts

```bash
# Check current version
npm view @atrim/instrumentation-node version

# Bump version
pnpm version patch
```

### Clear Local Registry

```bash
docker compose down
rm -rf tools/verdaccio/storage
docker compose up -d
```

## npm Tags

- `latest`: Current stable (default)
- `snapshot`: Snapshot/preview builds
- `next`: Next major version
- `beta`: Beta releases

## Post-Publish

1. Verify on npm: https://www.npmjs.com/package/@atrim/instrumentation-node
2. Test installation: `npm install @atrim/instrumentation-node`
3. Create GitHub release
4. Update documentation
