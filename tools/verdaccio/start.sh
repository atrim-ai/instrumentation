#!/bin/bash
set -e

cd "$(dirname "$0")"

echo "🚀 Starting Verdaccio local npm registry..."
docker-compose up -d

echo ""
echo "✅ Verdaccio is running at http://localhost:4873"
echo ""
echo "📦 To publish the package locally:"
echo "   pnpm publish:local"
echo ""
echo "🔑 First time setup (if needed):"
echo "   npm adduser --registry http://localhost:4873"
echo "   (Use any username/password/email)"
echo ""
echo "🛑 To stop:"
echo "   docker-compose down"
echo ""
