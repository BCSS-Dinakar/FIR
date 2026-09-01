#!/usr/bin/env bash
# Install pgvector on the PostgreSQL HOST (103.211.36.242), then enable on database `legislative`.
#
# Run ON THE DATABASE SERVER as root (SSH), NOT from the Node app.
# PostgreSQL version detected: 18.x (Ubuntu 26.04)
#
# Usage (on DB host):
#   sudo bash backend/scripts/dba/install-pgvector-ubuntu.sh

set -euo pipefail

PG_VERSION="${PG_VERSION:-18}"

echo "=== Installing pgvector for PostgreSQL ${PG_VERSION} ==="

if command -v apt-get >/dev/null 2>&1; then
  apt-get update
  # Ubuntu 26.04 / PostgreSQL 18 package name
  apt-get install -y "postgresql-${PG_VERSION}-pgvector" || {
    echo "Package postgresql-${PG_VERSION}-pgvector not found."
    echo "Build from source: https://github.com/pgvector/pgvector#installation"
    exit 1
  }
else
  echo "Unsupported OS — install pgvector manually for PostgreSQL ${PG_VERSION}"
  exit 1
fi

echo "=== Enabling extension on database legislative ==="
sudo -u postgres psql -d legislative -c "CREATE EXTENSION IF NOT EXISTS vector;"

echo "=== Verify ==="
sudo -u postgres psql -d legislative -c "SELECT extname, extversion FROM pg_extension WHERE extname = 'vector';"

echo "Done. Re-run from backend: npm run db:ingest-embeddings"
