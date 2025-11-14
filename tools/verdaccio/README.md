# Local Verdaccio Registry

This directory contains the configuration for a local Verdaccio npm registry for development and testing.

## Quick Start

### Start the registry

```bash
# From project root
pnpm registry:start
```

Verdaccio will be available at: http://localhost:4873

### Publish to local registry

```bash
# Build your package first
pnpm build

# Publish to local Verdaccio
pnpm publish:local
```

### Stop the registry

```bash
pnpm registry:stop
```

### View logs

```bash
pnpm registry:logs
```

## Using in Other Projects

To install packages from your local registry in another project:

```bash
# Set registry for @atrim scope only
npm config set @atrim:registry http://localhost:4873

# Or use .npmrc file
echo "@atrim:registry=http://localhost:4873" >> .npmrc

# Install the package
npm install @atrim/instrumentation
```

## Configuration

- **Config**: `tools/verdaccio/config.yaml`
- **Storage**: `tools/verdaccio/storage/` (gitignored)
- **Port**: 4873
- **UI**: http://localhost:4873

## Authentication

First time publishing, you'll need to add a user:

```bash
npm adduser --registry http://localhost:4873
```

Use any username/password/email - it's just for local development.

## Persistence

Package data is persisted in `tools/verdaccio/storage/` which is mounted as a Docker volume. This directory is gitignored so your published packages persist across container restarts but aren't committed to git.

## Troubleshooting

### Port already in use

```bash
# Stop existing container
docker compose down

# Or change port in docker-compose.yml
```

### Clear all published packages

```bash
# Stop container
docker compose down

# Remove storage
rm -rf tools/verdaccio/storage

# Start fresh
docker compose up -d
```

### Can't publish

Make sure you're authenticated:

```bash
npm adduser --registry http://localhost:4873
```
