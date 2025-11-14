# Local Verdaccio Registry

This directory contains the configuration for a local Verdaccio npm registry for testing package publishing locally.

## Quick Start

### 1. Start the Registry

```bash
cd tools/verdaccio
docker-compose up -d
```

The registry will be available at http://localhost:4873

### 2. Configure npm to Use Local Registry

```bash
# Set registry for @atrim scope
npm config set @atrim:registry http://localhost:4873

# Or use .npmrc in project root (already configured)
```

### 3. Publish Package

From the project root:

```bash
pnpm publish:local
```

### 4. Stop the Registry

```bash
cd tools/verdaccio
docker-compose down
```

## Web UI

Access the web interface at http://localhost:4873 to browse published packages.

## Data Persistence

The `storage/` directory contains all published packages and is persisted between restarts. This directory is gitignored.

## First Time Setup

On first run, you'll need to authenticate:

```bash
npm adduser --registry http://localhost:4873
```

Use any username/password/email combination (it's local only).

## Troubleshooting

### Reset Everything

To start fresh, remove the storage directory:

```bash
cd tools/verdaccio
docker-compose down
rm -rf storage
docker-compose up -d
```

### View Logs

```bash
cd tools/verdaccio
docker-compose logs -f
```
