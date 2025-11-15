# Publishing Guide

This document describes how to publish new versions of `@atrim/instrumentation` to npm.

## Overview

The project uses **tag-based versioning** with automated publishing via GitHub Actions:

- **Local development**: `package.json` version is always `0.0.0-dev` (never committed with real versions)
- **Releases**: Version is derived from git tags (e.g., `v0.1.0` → publishes `0.1.0` to npm)
- **Automation**: CI handles building, testing, and publishing automatically when tags are pushed

## Release Process

### 1. Ensure Branch is Ready

```bash
# Switch to main branch
git checkout main

# Pull latest changes
git pull origin main

# Verify everything is clean
git status
```

### 2. Create a Release Tag

Decide on the version number following [semantic versioning](https://semver.org/):

- **Patch** (0.1.0 → 0.1.1): Bug fixes, no breaking changes
- **Minor** (0.1.0 → 0.2.0): New features, backwards compatible
- **Major** (0.1.0 → 1.0.0): Breaking changes

```bash
# Create the tag (replace with your version)
git tag v0.1.0

# Push the tag to trigger the release
git push origin v0.1.0
```

### 3. Monitor the Release

GitHub Actions will automatically:

1. ✅ Set version from tag
2. ✅ Run TypeScript compilation check
3. ✅ Run linting
4. ✅ Build the package
5. ✅ Run tests with coverage
6. ✅ Publish to npm with provenance
7. ✅ Create GitHub release with auto-generated notes

**Watch the workflow:**
https://github.com/atrim-ai/instrumentation/actions

### 4. Verify Publication

Once the workflow completes:

- **npm package**: https://www.npmjs.com/package/@atrim/instrumentation
- **GitHub release**: https://github.com/atrim-ai/instrumentation/releases

Test installation:

```bash
npm install @atrim/instrumentation@0.1.0
```

## Pre-Release Checklist

Before creating a release tag, ensure:

- [ ] All tests pass locally: `pnpm test`
- [ ] TypeScript compiles: `pnpm typecheck`
- [ ] Linting passes: `pnpm lint`
- [ ] Build succeeds: `pnpm build`
- [ ] CHANGELOG updated (if applicable)
- [ ] README reflects current version capabilities
- [ ] All PRs for this release are merged

## Local Publishing (For Testing)

If you need to test publishing before using the automated CI workflow, you can publish directly from your local machine.

**⚠️ Note**: Local publishing cannot generate provenance attestations (GitHub Actions only), so use `--no-provenance`.

### Steps for Local Publishing

```bash
# 1. Login to npm (if not already logged in)
npm login

# 2. Set a test version
npm version 0.1.0-dev.1 --no-git-tag-version

# 3. Build the package
pnpm build

# 4. Publish with dev tag (won't be the default "latest")
npm publish --tag dev --access public --no-provenance

# 5. Reset version back to development
npm version 0.0.0-dev --no-git-tag-version
```

### Verify Local Publication

```bash
# View the published dev version
npm view @atrim/instrumentation@dev

# Install the dev version in a test project
npm install @atrim/instrumentation@dev

# Or install specific dev version
npm install @atrim/instrumentation@0.1.0-dev.1
```

### When to Use Local Publishing

- Testing the publishing process before CI setup
- Quick hotfix testing
- Verifying package contents
- Emergency manual publish (if CI is down)

**For production releases, always use the automated CI workflow** to ensure:
- ✅ Provenance attestations
- ✅ Full CI validation
- ✅ Consistent build environment
- ✅ Automated changelog generation

## Version Strategy

### Alpha/Beta Releases

For pre-release versions, use semantic versioning with pre-release tags:

```bash
# Alpha release (via CI)
git tag v0.1.0-alpha.1
git push origin v0.1.0-alpha.1

# Beta release (via CI)
git tag v0.1.0-beta.1
git push origin v0.1.0-beta.1

# Release candidate (via CI)
git tag v0.1.0-rc.1
git push origin v0.1.0-rc.1

# Dev release (local testing only)
npm version 0.1.0-dev.1 --no-git-tag-version
npm publish --tag dev --no-provenance
```

Pre-release versions can be installed with:

```bash
npm install @atrim/instrumentation@alpha  # Latest alpha
npm install @atrim/instrumentation@beta   # Latest beta
npm install @atrim/instrumentation@dev    # Latest dev
```

### Roadmap to v1.0.0

```
0.1.0       Initial alpha release
0.1.x       Bug fixes and patches
0.2.0       Beta release (feature complete)
0.2.x       Beta bug fixes
1.0.0       First stable release
```

## Troubleshooting

### Release Workflow Failed

1. Check the GitHub Actions logs for errors
2. Common issues:
   - Tests failing
   - Build errors
   - npm authentication issues (check `NPM_TOKEN` secret)
   - Invalid tag format (must be `vX.Y.Z`)

### Need to Unpublish

Within 72 hours of publication, you can unpublish:

```bash
npm unpublish @atrim/instrumentation@0.1.0
```

**⚠️ Warning**: Unpublishing is discouraged. Prefer publishing a patch version instead.

### Wrong Version Published

If you accidentally publish the wrong version:

1. Immediately publish a new patch version with the fix
2. Deprecate the bad version:

```bash
npm deprecate @atrim/instrumentation@0.1.0 "Accidentally published, use 0.1.1 instead"
```

### Tag Already Exists

If you need to change a tag:

```bash
# Delete local tag
git tag -d v0.1.0

# Delete remote tag
git push origin :refs/tags/v0.1.0

# Create new tag
git tag v0.1.0
git push origin v0.1.0
```

**⚠️ Note**: Only do this if the tag hasn't been published yet.

## Emergency Rollback

If a critical bug is discovered after release:

1. **Do NOT unpublish** (breaks existing users)
2. **Publish a patch** with the fix ASAP
3. **Deprecate the bad version**:

```bash
npm deprecate @atrim/instrumentation@0.1.0 "Critical bug, please upgrade to 0.1.1"
```

## Security

### NPM_TOKEN

The `NPM_TOKEN` GitHub secret must be:

- ✅ A **granular access token** (not legacy)
- ✅ Scoped to `@atrim` organization
- ✅ Has **read and write** permissions for `@atrim/instrumentation`
- ✅ Expires in 90 days or less (rotate regularly)

**Rotate the token every 90 days:**

1. Generate new token at: https://www.npmjs.com/settings/YOUR_USERNAME/tokens
2. Update GitHub secret: https://github.com/atrim-ai/instrumentation/settings/secrets/actions
3. Test with a pre-release version

### Provenance

All releases are published with **npm provenance** enabled, which:

- ✅ Proves packages were built by GitHub Actions
- ✅ Links packages to source code and workflow
- ✅ Provides supply chain security attestation

Learn more: https://docs.npmjs.com/generating-provenance-statements

## Local Testing

### Test Package Contents

Before creating a release tag, verify what will be published:

```bash
# Dry run (doesn't actually publish)
npm pack --dry-run

# Or create a tarball to inspect
npm pack
tar -tzf atrim-instrumentation-0.0.0-dev.tgz
```

### Test Local Installation

Create a test package and install from it:

```bash
# Build the package
pnpm build

# Create tarball
npm pack

# In another project
cd /tmp/test-project
npm install /path/to/atrim-instrumentation-0.0.0-dev.tgz

# Test imports
node -e "import('@atrim/instrumentation').then(console.log)"
```

## Automated Releases (Future)

For more automation, consider:

- **Changesets**: https://github.com/changesets/changesets
- **Release Please**: https://github.com/googleapis/release-please
- **Semantic Release**: https://github.com/semantic-release/semantic-release

These tools can auto-generate changelogs and determine version bumps from commit messages.

## Questions?

- **Documentation issues**: https://github.com/atrim-ai/instrumentation/issues
- **npm package**: https://www.npmjs.com/package/@atrim/instrumentation
- **Release workflow**: `.github/workflows/release.yml`
