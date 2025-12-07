#!/bin/bash

# ==============================================================================
# Configurador de Cron para Backup Automático
# ==============================================================================

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
BACKUP_SCRIPT="$SCRIPT_DIR/backup-rotate.sh"
LOG_DIR="$PROJECT_DIR/logs"

echo -e "${BLUE}=== Configurador de Backup Automático ===${NC}\n"

# Criar diretório de logs
mkdir -p "$LOG_DIR"

# Menu de opções
echo -e "${YELLOW}Escolha a frequência do backup:${NC}"
echo "1) A cada 6 horas"
echo "2) A cada 12 horas"
echo "3) Uma vez por dia (03:00)"
echo "4) Remover backup automático"
echo ""
read -p "Opção: " option

case $option in
    1)
        CRON_SCHEDULE="0 */6 * * *"
        DESCRIPTION="a cada 6 horas"
        ;;
    2)
        CRON_SCHEDULE="0 */12 * * *"
        DESCRIPTION="a cada 12 horas"
        ;;
    3)
        CRON_SCHEDULE="0 3 * * *"
        DESCRIPTION="diariamente às 03:00"
        ;;
    4)
        # Remover job existente
        echo -e "\n${YELLOW}Removendo backup automático...${NC}"
        (crontab -l 2>/dev/null | grep -v "shortsai.*backup-rotate.sh") | crontab -
        echo -e "${GREEN}✓ Backup automático removido${NC}"
        exit 0
        ;;
    *)
        echo -e "${RED}Opção inválida${NC}"
        exit 1
        ;;
esac

# Criar job do cron
CRON_JOB="$CRON_SCHEDULE cd $PROJECT_DIR && bash $BACKUP_SCRIPT >> $LOG_DIR/backup.log 2>&1"

echo -e "\n${YELLOW}Configurando backup ${DESCRIPTION}...${NC}"

# Remover job antigo se existir
(crontab -l 2>/dev/null | grep -v "shortsai.*backup-rotate.sh") | crontab -

# Adicionar novo job
(crontab -l 2>/dev/null; echo "$CRON_JOB") | crontab -

echo -e "${GREEN}✓ Cron configurado com sucesso!${NC}\n"

# Mostrar configuração
echo -e "${BLUE}Configuração:${NC}"
echo -e "  Frequência: ${DESCRIPTION}"
echo -e "  Script: $BACKUP_SCRIPT"
echo -e "  Logs: $LOG_DIR/backup.log"
echo -e "  Backups: $PROJECT_DIR/backups/"

# Mostrar jobs do cron
echo -e "\n${BLUE}Jobs do cron ativos:${NC}"
crontab -l | grep -i shortsai

# Testar backup agora
echo -e "\n${YELLOW}Deseja executar um backup agora para testar? (s/N)${NC}"
read -n 1 -r
echo
if [[ $REPLY =~ ^[Ss]$ ]]; then
    echo -e "\n${YELLOW}Executando backup de teste...${NC}"
    cd "$PROJECT_DIR" && bash "$BACKUP_SCRIPT"
fi

echo -e "\n${GREEN}✓ Setup completo!${NC}"
echo -e "${BLUE}Para ver logs em tempo real: tail -f $LOG_DIR/backup.log${NC}"
