#!/bin/bash
set -e

# Verdaccio Snapshot Publishing Script
# Publishes dev snapshot versions to local Verdaccio registry

REGISTRY="http://localhost:4873"
TAG="dev"
TIMESTAMP=$(date -u +%Y%m%d%H%M%S)
SHORT_SHA=$(git rev-parse --short HEAD 2>/dev/null || echo "local")

echo "=== Atrim Instrumentation Snapshot Publisher ==="
echo "Registry: $REGISTRY"
echo "Tag: $TAG"
echo "Timestamp: $TIMESTAMP"
echo "Git SHA: $SHORT_SHA"
echo ""

# Check if Verdaccio is running
if ! curl -s "$REGISTRY" > /dev/null 2>&1; then
    echo "Error: Verdaccio is not running at $REGISTRY"
    echo "Start it with: verdaccio"
    exit 1
fi

# Packages to publish (order matters for dependencies)
PACKAGES=(
    "packages/node:@atrim/instrument-node"
    "packages/web:@atrim/instrument-web"
)

# Store original versions for restoration
declare -A ORIGINAL_VERSIONS

echo "=== Step 1: Creating snapshot versions ==="
for pkg_info in "${PACKAGES[@]}"; do
    IFS=':' read -r pkg_path pkg_name <<< "$pkg_info"

    cd "$pkg_path"

    # Get base version (strip any existing prerelease tag)
    BASE_VERSION=$(node -p "require('./package.json').version.split('-')[0]")
    SNAPSHOT_VERSION="${BASE_VERSION}-${TAG}.${SHORT_SHA}.${TIMESTAMP}"

    # Store original for restoration
    ORIGINAL_VERSIONS["$pkg_path"]=$(node -p "require('./package.json').version")

    echo "  $pkg_name: $BASE_VERSION -> $SNAPSHOT_VERSION"

    # Update version
    npm version "$SNAPSHOT_VERSION" --no-git-tag-version --allow-same-version > /dev/null

    cd - > /dev/null
done

echo ""
echo "=== Step 2: Publishing to Verdaccio ==="
for pkg_info in "${PACKAGES[@]}"; do
    IFS=':' read -r pkg_path pkg_name <<< "$pkg_info"

    cd "$pkg_path"

    echo "  Publishing $pkg_name..."
    pnpm publish --registry "$REGISTRY" --tag "$TAG" --no-git-checks --access public 2>&1 | sed 's/^/    /'

    cd - > /dev/null
done

echo ""
echo "=== Step 3: Restoring original versions ==="
for pkg_info in "${PACKAGES[@]}"; do
    IFS=':' read -r pkg_path pkg_name <<< "$pkg_info"

    cd "$pkg_path"

    # Restore original version
    git checkout package.json > /dev/null 2>&1

    echo "  $pkg_name: restored to ${ORIGINAL_VERSIONS[$pkg_path]}"

    cd - > /dev/null
done

echo ""
echo "=== Done! ==="
echo ""
echo "Install with:"
echo "  pnpm add @atrim/instrument-node@$TAG --registry $REGISTRY"
echo "  pnpm add @atrim/instrument-web@$TAG --registry $REGISTRY"
echo ""
echo "Or add to .npmrc:"
echo "  @atrim:registry=$REGISTRY"
