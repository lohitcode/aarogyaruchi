#!/bin/bash
# Nightly Postgres backup with off-server retention.
#
# Install on the VPS (ubuntu@box):
#   sudo install -m 755 scripts/backup.sh /usr/local/bin/aarogya-backup
#   sudo tee /etc/cron.d/aarogya-backup <<'CRON'
#   30 2 * * * ubuntu BACKUP_TARGET= /usr/local/bin/aarogya-backup
#   CRON
#
# BACKUP_TARGET (optional): "user@host:/path" — backups are also rsynced
# off the box. Without it, backups stay local with 7-day retention.
set -euo pipefail

BACKUP_DIR=/app/backups
RETENTION_DAYS=7
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
mkdir -p "$BACKUP_DIR"

echo "==> dumping aarogya_ruchi -> $BACKUP_DIR/aarogya_ruchi-$STAMP.dump"
sudo docker compose -f /app/docker-compose.yml exec -T postgres \
  pg_dump -U aarogya -d aarogya_ruchi -Fc \
  > "$BACKUP_DIR/aarogya_ruchi-$STAMP.dump"

echo "==> pruning backups older than $RETENTION_DAYS days"
find "$BACKUP_DIR" -name 'aarogya_ruchi-*.dump' -mtime "+$RETENTION_DAYS" -delete

if [ -n "${BACKUP_TARGET:-}" ]; then
  echo "==> copying to $BACKUP_TARGET"
  rsync -a --remove-source-files=false "$BACKUP_DIR/aarogya_ruchi-$STAMP.dump" "$BACKUP_TARGET/"
fi

echo "==> done: $(du -h "$BACKUP_DIR/aarogya_ruchi-$STAMP.dump" | cut -f1)"

# Restore verification (run once after first production data, then after
# any infra change):
#   docker compose -f /app/docker-compose.yml exec -T postgres \
#     psql -U aarogya -c 'CREATE DATABASE aarogya_ruchi_restore;'
#   docker compose -f /app/docker-compose.yml exec -T postgres \
#     pg_restore -U aarogya -d aarogya_ruchi_restore --no-owner \
#     < backups/aarogya_ruchi-<STAMP>.dump
#   ... spot-check tables, then:
#   docker compose -f /app/docker-compose.yml exec -T postgres \
#     psql -U aarogya -c 'DROP DATABASE aarogya_ruchi_restore;'
