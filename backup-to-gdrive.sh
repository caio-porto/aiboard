#!/bin/bash
set -e

LOG_FILE="/var/log/rclone-crewai.log"
BASE_DIR="/opt/crewai"
BACKUP_ROOT="$BASE_DIR/backups"
DB_BACKUP_DIR="$BACKUP_ROOT/db"
CONFIG_BACKUP_DIR="$BACKUP_ROOT/config"
LAST_STATUS_FILE="$BACKUP_ROOT/last_backup.json"
CONFIG_JSON="$BASE_DIR/data/backup_config.json"

GDRIVE_PATH="gdrive:IT/Internal Software/ServerBackup/crewai"
RETENTION_DAYS=14

if [ -f "$CONFIG_JSON" ]; then
    PARSED_PATH=$(python3 -c "import json; d=json.load(open('$CONFIG_JSON')); print(d.get('gdrive_path',''))" 2>/dev/null || true)
    PARSED_DAYS=$(python3 -c "import json; d=json.load(open('$CONFIG_JSON')); print(d.get('retention_days',14))" 2>/dev/null || true)
    if [ -n "$PARSED_PATH" ]; then
        GDRIVE_PATH="$PARSED_PATH"
    fi
    if [ -n "$PARSED_DAYS" ]; then
        RETENTION_DAYS="$PARSED_DAYS"
    fi
fi

mkdir -p "$DB_BACKUP_DIR"
mkdir -p "$CONFIG_BACKUP_DIR"

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DATE_HUMAN=$(date "+%d/%m/%Y %H:%M:%S")

echo "=== [AI Board Backup] Iniciado em $DATE_HUMAN (Destino: $GDRIVE_PATH) ===" >> "$LOG_FILE"

DB_FILE="$BASE_DIR/data/tasks.db"
TARGET_DUMP="$DB_BACKUP_DIR/tasks_${TIMESTAMP}.db"
TARGET_GZ="$TARGET_DUMP.gz"

if [ -f "$DB_FILE" ]; then
    sqlite3 "$DB_FILE" ".backup '$TARGET_DUMP'"
    gzip -9 -f "$TARGET_DUMP"
    cp -f "$TARGET_GZ" "$DB_BACKUP_DIR/tasks_latest.db.gz"
    DB_SIZE=$(du -h "$TARGET_GZ" | cut -f1)
fi

find "$DB_BACKUP_DIR" -type f -name "tasks_*.db.gz" -mtime +"$RETENTION_DAYS" -delete

APP_DOMAIN="${APP_DOMAIN:-aiboard}"
cp -f "$BASE_DIR/.env" "$CONFIG_BACKUP_DIR/.env" 2>/dev/null || true
cp -f "$BASE_DIR/docker-compose.yml" "$CONFIG_BACKUP_DIR/docker-compose.yml" 2>/dev/null || true
cp -f "/etc/nginx/sites-available/${APP_DOMAIN}" "$CONFIG_BACKUP_DIR/${APP_DOMAIN}.nginx.conf" 2>/dev/null || true

/usr/bin/rclone sync "$DB_BACKUP_DIR/" "${GDRIVE_PATH}/db" --log-file=/var/log/rclone-crewai-db.log >> "$LOG_FILE" 2>&1
/usr/bin/rclone sync "$CONFIG_BACKUP_DIR/" "${GDRIVE_PATH}/config" --log-file=/var/log/rclone-crewai-config.log >> "$LOG_FILE" 2>&1
/usr/bin/rclone sync "$BASE_DIR/" "${GDRIVE_PATH}/code" \
    --exclude "frontend/node_modules/**" \
    --exclude "frontend/dist/**" \
    --exclude ".git/**" \
    --exclude "__pycache__/**" \
    --exclude "data/**" \
    --exclude "backups/**" \
    --log-file=/var/log/rclone-crewai-code.log >> "$LOG_FILE" 2>&1

STATUS_JSON=$(cat <<EOF
{
  "status": "success",
  "timestamp": $(date +%s),
  "date_human": "$DATE_HUMAN",
  "backup_file": "tasks_${TIMESTAMP}.db.gz",
  "db_size": "${DB_SIZE:-desconhecido}",
  "gdrive_path": "$GDRIVE_PATH"
}
EOF
)
echo "$STATUS_JSON" > "$LAST_STATUS_FILE"
echo "$STATUS_JSON" > "$BASE_DIR/data/last_backup.json"
rm -f "$BASE_DIR/data/backup.trigger"
echo "Backup finalizado com sucesso."
