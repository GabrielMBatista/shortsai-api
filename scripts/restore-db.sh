#!/bin/bash

# ==============================================================================
# Script de Restauração do Banco de Dados ShortsAI
# ==============================================================================

# Configurações
CONTAINER_NAME="shortsai-db"
POSTGRES_USER="${POSTGRES_USER:-postgres}"
POSTGRES_DB="${POSTGRES_DB:-shortsai}"
BACKUP_DIR="./backups"

# Cores
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Verificar se arquivo foi fornecido
if [ -z "$1" ]; then
    echo -e "${RED}Erro: Especifique o arquivo de backup${NC}"
    echo -e "${YELLOW}Uso: ./restore-db.sh <arquivo_backup>${NC}"
    echo -e "\n${YELLOW}Backups disponíveis:${NC}"
    ls -lht "$BACKUP_DIR"
    exit 1
fi

BACKUP_FILE="$1"

# Verificar se arquivo existe
if [ ! -f "$BACKUP_FILE" ]; then
    # Tentar com caminho completo do backup dir
    if [ -f "${BACKUP_DIR}/${BACKUP_FILE}" ]; then
        BACKUP_FILE="${BACKUP_DIR}/${BACKUP_FILE}"
    else
        echo -e "${RED}Erro: Arquivo não encontrado: $BACKUP_FILE${NC}"
        exit 1
    fi
fi

echo -e "${GREEN}=== Restauração do Banco ShortsAI ===${NC}"
echo -e "${YELLOW}Arquivo: ${BACKUP_FILE}${NC}"

# Verificar se container está rodando
if ! docker ps | grep -q "$CONTAINER_NAME"; then
    echo -e "${RED}Erro: Container $CONTAINER_NAME não está rodando${NC}"
    exit 1
fi

# Confirmação
echo -e "${RED}ATENÇÃO: Esta operação substituirá TODOS os dados atuais do banco!${NC}"
read -p "Deseja continuar? (s/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Ss]$ ]]; then
    echo -e "${YELLOW}Operação cancelada${NC}"
    exit 0
fi

# Descompactar se for .gz
TEMP_FILE="$BACKUP_FILE"
if [[ "$BACKUP_FILE" == *.gz ]]; then
    echo -e "${YELLOW}Descompactando...${NC}"
    TEMP_FILE="${BACKUP_FILE%.gz}"
    gunzip -c "$BACKUP_FILE" > "$TEMP_FILE"
fi

echo -e "${YELLOW}Restaurando banco...${NC}"

# Restaurar via docker exec
docker exec -i "$CONTAINER_NAME" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" < "$TEMP_FILE"

# Limpar arquivo temporário
if [[ "$BACKUP_FILE" == *.gz ]]; then
    rm -f "$TEMP_FILE"
fi

# Verificar sucesso
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Banco restaurado com sucesso!${NC}"
else
    echo -e "${RED}✗ Erro ao restaurar banco${NC}"
    exit 1
fi
