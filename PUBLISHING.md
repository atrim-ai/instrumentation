# Publishing Guide

This document explains how to publish `@atrim/instrumentation` to npm.

## Prerequisites

1. **npm account**: You need an npm account with publish access to the `@atrim` scope
2. **npm token**: Set up an `NPM_TOKEN` secret in GitHub repository settings
3. **Local authentication**: Run `npm login` for local publishing

## Publishing Methods

### 1. Manual Publishing (Local)

#### Dry Run (Test)
Test what will be published without actually publishing:
```bash
pnpm run publish:dry-run
```

#### Snapshot Release
Publish a snapshot/prerelease version for testing:
```bash
# This will bump version to 0.1.0-SNAPSHOT.0 (or next prerelease)
pnpm run publish:snapshot
```

Users can install snapshots with:
```bash
npm install @atrim/instrumentation@snapshot
```

#### Production Release
Publish a production release:
```bash
# Update version in package.json manually, then:
pnpm run publish:public

# Or bump version and publish in one step:
pnpm version patch  # or minor, major, etc.
pnpm run publish:public
```

### 2. GitHub Actions Publishing

Use the "Publish to npm" workflow from the GitHub Actions tab:

1. Go to **Actions** → **Publish to npm**
2. Click **Run workflow**
3. Select publish type:
   - **dry-run**: Test what will be published (no actual publish)
   - **snapshot**: Publish as `0.1.0-SNAPSHOT.x` with `@snapshot` tag
   - **release**: Publish as production release with version tag

For releases, optionally specify a version (e.g., `0.2.0`, `1.0.0-beta.1`).

## Version Conventions

- **Production releases**: `0.1.0`, `0.2.0`, `1.0.0`
- **Beta releases**: `0.2.0-beta.1`, `1.0.0-beta.2`
- **Snapshot releases**: `0.1.0-SNAPSHOT.0`, `0.1.0-SNAPSHOT.1`

## Pre-publish Checklist

Before publishing, ensure:

- [ ] All tests pass (`pnpm test`)
- [ ] Integration tests pass (`pnpm test:integration`)
- [ ] Build succeeds (`pnpm build`)
- [ ] Type checking passes (`pnpm typecheck`)
- [ ] Linting passes (`pnpm lint`)
- [ ] CHANGELOG.md is updated
- [ ] README.md is up to date
- [ ] Version number follows semver

## Tarball Generation

To create a tarball for local testing or manual distribution:

```bash
pnpm pack
```

This creates `atrim-instrumentation-{version}.tgz` which can be installed with:

```bash
npm install /path/to/atrim-instrumentation-{version}.tgz
```

## CI/CD Integration

The CI workflow automatically:
- Builds and tests on every push
- Creates package tarballs as artifacts (available for 30 days)
- Validates package can be installed

Package tarballs can be downloaded from:
**Actions** → **CI** → Select run → **Artifacts** → **npm-package**

## Troubleshooting

### Authentication Issues
```bash
# Login to npm
npm login

# Verify authentication
npm whoami
```

### Version Conflicts
If a version already exists on npm:
```bash
# Check current version
npm view @atrim/instrumentation version

# Bump to next version
pnpm version patch  # or minor, major
```

### Dry Run First
Always test with dry-run before publishing:
```bash
pnpm run publish:dry-run
```

## npm Tags

- `latest`: Current stable release (default)
- `snapshot`: Snapshot/preview builds
- `next`: Next major version (if applicable)
- `beta`: Beta releases

## Post-Publish

After publishing:
1. Verify package on npm: https://www.npmjs.com/package/@atrim/instrumentation
2. Test installation: `npm install @atrim/instrumentation`
3. Create GitHub release with changelog
4. Update documentation if needed
