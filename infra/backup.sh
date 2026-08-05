#!/usr/bin/env bash
set -euo pipefail
BACKUP_DIR="${BACKUP_DIR:-/var/backups/fairshare}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$BACKUP_DIR"
container="$(docker compose -f infra/docker-compose.yml ps -q api)"
docker exec "$container" node -e "const Database=require('better-sqlite3');const db=new Database('/data/fairshare.db');db.backup('/data/fairshare-backup.db').then(()=>db.close())"
docker cp "$container:/data/fairshare-backup.db" "$BACKUP_DIR/fairshare-$STAMP.db"
gzip "$BACKUP_DIR/fairshare-$STAMP.db"
find "$BACKUP_DIR" -type f -name 'fairshare-*.db.gz' -mtime +30 -delete
