#!/bin/bash

# ==============================================================================
# Script de Backup do Banco de Dados ShortsAI
# ==============================================================================

# Configurações
CONTAINER_NAME="shortsai-db"
POSTGRES_USER="${POSTGRES_USER:-postgres}"
POSTGRES_DB="${POSTGRES_DB:-shortsai}"
BACKUP_DIR="./backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="shortsai_backup_${TIMESTAMP}.sql"

# Cores
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== Backup do Banco ShortsAI ===${NC}"

# Criar diretório de backups se não existir
mkdir -p "$BACKUP_DIR"

# Verificar se container está rodando
if ! docker ps | grep -q "$CONTAINER_NAME"; then
    echo -e "${RED}Erro: Container $CONTAINER_NAME não está rodando${NC}"
    exit 1
fi

echo -e "${YELLOW}Iniciando backup...${NC}"

# Executar pg_dump via docker exec
docker exec -t "$CONTAINER_NAME" pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists > "${BACKUP_DIR}/${BACKUP_FILE}"

# Verificar sucesso
if [ $? -eq 0 ]; then
    # Comprimir backup
    gzip "${BACKUP_DIR}/${BACKUP_FILE}"
    BACKUP_FILE_GZ="${BACKUP_FILE}.gz"
    
    # Tamanho do arquivo
    SIZE=$(du -h "${BACKUP_DIR}/${BACKUP_FILE_GZ}" | cut -f1)
    
    echo -e "${GREEN}✓ Backup concluído com sucesso!${NC}"
    echo -e "${GREEN}  Arquivo: ${BACKUP_DIR}/${BACKUP_FILE_GZ}${NC}"
    echo -e "${GREEN}  Tamanho: ${SIZE}${NC}"
    
    # Listar últimos 5 backups
    echo -e "\n${YELLOW}Últimos backups:${NC}"
    ls -lht "$BACKUP_DIR" | head -6
else
    echo -e "${RED}✗ Erro ao criar backup${NC}"
    exit 1
fi
