#!/bin/bash
set -e

# ==============================================================================
# Script de Restauração AI Board Studio a partir do Google Drive (rclone)
# Padrão: gdrive:IT/Internal Software/ServerBackup/crewai
# ==============================================================================

BASE_DIR="/opt/crewai"
BACKUP_ROOT="$BASE_DIR/backups"
DB_BACKUP_DIR="$BACKUP_ROOT/db"
DB_FILE="$BASE_DIR/data/tasks.db"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

echo "=== [CrewAI Restore] Iniciando procedimento de recuperação ==="

# 1. Cria diretórios locais se não existirem
mkdir -p "$DB_BACKUP_DIR"
mkdir -p "$BASE_DIR/data"

# 2. Faz backup de segurança do estado atual antes da restauração
if [ -f "$DB_FILE" ]; then
    SAFETY_COPY="$BASE_DIR/data/tasks_pre_restore_${TIMESTAMP}.db"
    echo "Criando cópia de segurança pré-restauração em $SAFETY_COPY..."
    cp -f "$DB_FILE" "$SAFETY_COPY"
fi

# 3. Baixa os backups do Google Drive via rclone
echo "Baixando backups mais recentes do Google Drive..."
/usr/bin/rclone sync "gdrive:IT/Internal Software/ServerBackup/crewai/db" "$DB_BACKUP_DIR/" -v

# 4. Localiza o arquivo de backup a restaurar
RESTORE_SOURCE="$1"
if [ -z "$RESTORE_SOURCE" ]; then
    if [ -f "$DB_BACKUP_DIR/tasks_latest.db.gz" ]; then
        RESTORE_SOURCE="$DB_BACKUP_DIR/tasks_latest.db.gz"
    else
        RESTORE_SOURCE=$(ls -t "$DB_BACKUP_DIR"/tasks_*.db.gz 2>/dev/null | head -n 1)
    fi
fi

if [ -z "$RESTORE_SOURCE" ] || [ ! -f "$RESTORE_SOURCE" ]; then
    echo "ERRO: Nenhum arquivo de backup válido encontrado para restauração."
    exit 1
fi

echo "Restaurando a partir de: $RESTORE_SOURCE ..."

# 5. Descompacta e substitui o banco SQLite
TEMP_RESTORE="/tmp/tasks_restore_${TIMESTAMP}.db"
gzip -dc "$RESTORE_SOURCE" > "$TEMP_RESTORE"

# Verifica integridade do SQLite descompactado
sqlite3 "$TEMP_RESTORE" "PRAGMA integrity_check;"

# Para o serviço temporariamente para substituição limpa do arquivo
echo "Atualizando tasks.db ativo..."
cp -f "$TEMP_RESTORE" "$DB_FILE"
rm -f "$TEMP_RESTORE"

# 6. Reinicia o backend para carregar o banco restaurado
echo "Reiniciando contêiner crewai-api..."
cd "$BASE_DIR"
docker restart crewai-api

echo "=== [CrewAI Restore] Restauração concluída com sucesso! ==="
