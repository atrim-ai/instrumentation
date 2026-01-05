#!/bin/bash
set -e

# NPM Snapshot Publishing Script
# Publishes dev snapshot versions to npmjs registry
#
# Usage: ./publish-snapshot.sh [OTP]
#   OTP: Optional one-time password for npm 2FA

OTP="$1"
TAG="dev"
TIMESTAMP=$(date -u +%Y%m%d%H%M%S)
SHORT_SHA=$(git rev-parse --short HEAD 2>/dev/null || echo "local")
REPO_ROOT=$(pwd)

echo "=== Atrim Instrumentation Snapshot Publisher ==="
echo "Registry: https://registry.npmjs.org"
echo "Tag: $TAG"
echo "Timestamp: $TIMESTAMP"
echo "Git SHA: $SHORT_SHA"
echo ""

# Configure npm auth from environment variable if set
if [ -n "$NPM_TOKEN" ]; then
    echo "Using NPM_TOKEN from environment"
    npm config set //registry.npmjs.org/:_authToken "$NPM_TOKEN"
fi

# Check npm auth
if ! npm whoami > /dev/null 2>&1; then
    echo "Error: Not logged in to npm"
    echo "Either run 'npm login' or set NPM_TOKEN in .envrc"
    exit 1
fi

# Packages to publish (paths relative to repo root)
PACKAGES=(
    "packages/node"
    "packages/web"
)

echo "=== Step 1: Creating snapshot versions ==="
for pkg_path in "${PACKAGES[@]}"; do
    cd "$REPO_ROOT/$pkg_path"

    # Get package name from package.json
    pkg_name=$(node -p "require('./package.json').name")

    # Get base version and increment patch for dev release
    BASE_VERSION=$(node -p "require('./package.json').version.split('-')[0]")
    NEXT_VERSION=$(node -p "const [major, minor, patch] = '${BASE_VERSION}'.split('.').map(Number); \`\${major}.\${minor}.\${patch + 1}\`")
    SNAPSHOT_VERSION="${NEXT_VERSION}-${TAG}.${SHORT_SHA}.${TIMESTAMP}"

    echo "  $pkg_name: $SNAPSHOT_VERSION"

    # Update version
    npm version "$SNAPSHOT_VERSION" --no-git-tag-version --allow-same-version > /dev/null
done

echo ""
echo "=== Step 2: Publishing to npm ==="
for pkg_path in "${PACKAGES[@]}"; do
    cd "$REPO_ROOT/$pkg_path"

    # Get package name from package.json
    pkg_name=$(node -p "require('./package.json').name")

    echo "  Publishing $pkg_name..."
    if [ -n "$OTP" ]; then
        pnpm publish --tag "$TAG" --no-git-checks --access public --otp "$OTP" 2>&1 | sed 's/^/    /'
    else
        pnpm publish --tag "$TAG" --no-git-checks --access public 2>&1 | sed 's/^/    /'
    fi
done

echo ""
echo "=== Step 3: Restoring original versions ==="
cd "$REPO_ROOT"
git checkout -- packages/node/package.json packages/web/package.json
echo "  Restored all package.json files"

echo ""
echo "=== Done! ==="
echo ""
echo "Install with:"
echo "  pnpm add @atrim/instrument-node@$TAG"
echo "  pnpm add @atrim/instrument-web@$TAG"
