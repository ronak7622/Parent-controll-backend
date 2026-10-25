#!/usr/bin/env bash
# =====================================================================
# Mongo -> Cloudflare R2 nightly backup with rotation.
# Requires on the host: mongodump (mongodb-database-tools) + aws CLI.
# Cron example (daily 02:30):
#   30 2 * * *  /path/to/backend/scripts/backup-mongo.sh >> /var/log/mongo-backup.log 2>&1
# =====================================================================
set -euo pipefail

# Load .env so cron has the vars
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${ENV_FILE:-$SCRIPT_DIR/../.env}"
if [ -f "$ENV_FILE" ]; then set -a; . "$ENV_FILE"; set +a; fi

: "${MONGODB_URI:?MONGODB_URI required}"
: "${R2_ACCOUNT_ID:?R2_ACCOUNT_ID required}"
: "${R2_ACCESS_KEY_ID:?R2_ACCESS_KEY_ID required}"
: "${R2_SECRET_ACCESS_KEY:?R2_SECRET_ACCESS_KEY required}"

BUCKET="${BACKUP_R2_BUCKET:-${R2_BUCKET_NAME:-child-protect-media}}"
PREFIX="${BACKUP_PREFIX:-backups/mongo}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
R2_ENDPOINT="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"

STAMP="$(date -u +%Y%m%d-%H%M%S)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
ARCHIVE="$TMP/mongo-$STAMP.archive.gz"

echo "[backup] $(date -u) dumping database..."
mongodump --uri="$MONGODB_URI" --archive="$ARCHIVE" --gzip

export AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID"
export AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY"
export AWS_DEFAULT_REGION="auto"

KEY="$PREFIX/mongo-$STAMP.archive.gz"
echo "[backup] uploading to s3://$BUCKET/$KEY ..."
aws s3 cp "$ARCHIVE" "s3://$BUCKET/$KEY" --endpoint-url "$R2_ENDPOINT"

echo "[backup] rotating (keep ${RETENTION_DAYS} days)..."
# Compute cutoff YYYYMMDD (GNU date on Linux; BSD date fallback for mac)
CUTOFF="$(date -u -d "-${RETENTION_DAYS} days" +%Y%m%d 2>/dev/null || date -u -v-"${RETENTION_DAYS}"d +%Y%m%d)"
aws s3 ls "s3://$BUCKET/$PREFIX/" --endpoint-url "$R2_ENDPOINT" | awk '{print $4}' | while read -r f; do
  [ -z "$f" ] && continue
  fdate="$(echo "$f" | sed -n 's/^mongo-\([0-9]\{8\}\)-.*/\1/p')"
  if [ -n "$fdate" ] && [ "$fdate" -lt "$CUTOFF" ]; then
    echo "[backup] deleting old $f"
    aws s3 rm "s3://$BUCKET/$PREFIX/$f" --endpoint-url "$R2_ENDPOINT"
  fi
done

echo "[backup] done $(date -u)"
