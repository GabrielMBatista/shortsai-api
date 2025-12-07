#!/bin/bash

# ==============================================================================
# Backup Rotativo do Banco ShortsAI
# Mantém apenas os últimos N backups (padrão: 4)
# ==============================================================================

# Configurações
CONTAINER_NAME="shortsai-db"
POSTGRES_USER="${POSTGRES_USER:-postgres}"
POSTGRES_DB="${POSTGRES_DB:-shortsai}"
BACKUP_DIR="./backups"
MAX_BACKUPS=4  # Quantos backups manter (4 backups a cada 6h = 24h de histórico)
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="shortsai_backup_${TIMESTAMP}.sql"

# Cores
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}=== Backup Rotativo ShortsAI ===${NC}"
echo -e "${BLUE}Mantendo últimos ${MAX_BACKUPS} backups${NC}\n"

# Criar diretório se não existir
mkdir -p "$BACKUP_DIR"

# Verificar container
if ! docker ps | grep -q "$CONTAINER_NAME"; then
    echo -e "${RED}✗ Erro: Container $CONTAINER_NAME não está rodando${NC}"
    exit 1
fi

# Fazer backup
echo -e "${YELLOW}► Criando backup...${NC}"
docker exec -t "$CONTAINER_NAME" pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists > "${BACKUP_DIR}/${BACKUP_FILE}"

if [ $? -ne 0 ]; then
    echo -e "${RED}✗ Erro ao criar backup${NC}"
    exit 1
fi

# Comprimir
echo -e "${YELLOW}► Comprimindo...${NC}"
gzip "${BACKUP_DIR}/${BACKUP_FILE}"
BACKUP_FILE_GZ="${BACKUP_FILE}.gz"

# Verificar tamanho
SIZE=$(du -h "${BACKUP_DIR}/${BACKUP_FILE_GZ}" | cut -f1)
echo -e "${GREEN}✓ Backup criado: ${BACKUP_FILE_GZ} (${SIZE})${NC}"

# Limpar backups antigos (mantém apenas os últimos MAX_BACKUPS)
echo -e "\n${YELLOW}► Limpando backups antigos...${NC}"
BACKUP_COUNT=$(ls -1 "${BACKUP_DIR}"/shortsai_backup_*.sql.gz 2>/dev/null | wc -l)

if [ "$BACKUP_COUNT" -gt "$MAX_BACKUPS" ]; then
    TO_DELETE=$((BACKUP_COUNT - MAX_BACKUPS))
    echo -e "${YELLOW}  Removendo ${TO_DELETE} backup(s) antigo(s)${NC}"
    
    ls -1t "${BACKUP_DIR}"/shortsai_backup_*.sql.gz | tail -n +$((MAX_BACKUPS + 1)) | while read old_backup; do
        rm -f "$old_backup"
        echo -e "  ${RED}✗${NC} Removido: $(basename "$old_backup")"
    done
fi

# Mostrar backups restantes
echo -e "\n${BLUE}📦 Backups armazenados (${BACKUP_COUNT}/${MAX_BACKUPS}):${NC}"
ls -lht "${BACKUP_DIR}"/shortsai_backup_*.sql.gz 2>/dev/null | awk '{print "  " $9 " - " $5}' | head -n $MAX_BACKUPS

# Espaço usado
TOTAL_SIZE=$(du -sh "$BACKUP_DIR" | cut -f1)
echo -e "\n${BLUE}💾 Espaço total usado: ${TOTAL_SIZE}${NC}"

echo -e "\n${GREEN}✓ Backup rotativo concluído!${NC}"
