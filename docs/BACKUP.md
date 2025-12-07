# 📦 Backup e Restauração - Guia Completo

## 🎯 Visão Geral

Sistema completo de backup automático do PostgreSQL para ShortsAI.

---

## 🚀 Setup Inicial na VPS (Uma Vez Apenas)

### 1️⃣ Após Deploy, Conectar na VPS

```bash
ssh root@srv1161960.hstgr.cloud
cd /root/shortsai-api
```

### 2️⃣ Dar Permissão e Configurar

```bash
chmod +x scripts/*.sh
bash scripts/setup-cron.sh
```

**Escolha opção `1`** (backup a cada 6 horas)

### 3️⃣ Pronto!

✅ Backup automático configurado  
✅ Roda a cada 6h: 00:00, 06:00, 12:00, 18:00  
✅ Mantém últimos 4 backups (24h de histórico)  
✅ Funciona para sempre (mesmo após reiniciar VPS)

---

## 📋 Scripts Disponíveis

### `backup-rotate.sh` (Automático)
Rodado pelo cron a cada 6h. Mantém apenas os últimos 4 backups.

```bash
# Executar manualmente se quiser
bash scripts/backup-rotate.sh
```

### `backup-db.sh` (Manual)
Backup manual sem rotação. Útil antes de mudanças críticas.

```bash
bash scripts/backup-db.sh
```

### `restore-db.sh` (Restauração)
Restaura um backup no banco.

```bash
bash scripts/restore-db.sh backups/shortsai_backup_20251207_120000.sql.gz
```

### `setup-cron.sh` (Configuração)
Configura/reconfigura o cron job.

```bash
bash scripts/setup-cron.sh
```

---

## 🔍 Monitoramento

### Ver backups criados

```bash
ls -lht backups/
```

### Ver logs de execução

```bash
tail -f logs/backup.log
```

### Verificar cron configurado

```bash
crontab -l
```

### Ver espaço usado

```bash
du -sh backups/
```

---

## 🔄 Restauração

### Listar backups disponíveis

```bash
ls -lht backups/
```

### Restaurar backup

```bash
bash scripts/restore-db.sh backups/shortsai_backup_TIMESTAMP.sql.gz
```

⚠️ **ATENÇÃO:** Restauração apaga todos os dados atuais!

---

## 📥 Baixar Backup da VPS para Local

```bash
# No seu PC (Windows/Linux)
scp root@srv1161960.hstgr.cloud:/root/shortsai-api/backups/shortsai_backup_*.sql.gz ./
```

---

## ⚙️ Reconfigurar Cron

### Mudar frequência

```bash
bash scripts/setup-cron.sh
```

### Desativar backup automático

```bash
bash scripts/setup-cron.sh
# Escolha opção 4
```

---

## 📊 Como Funciona a Rotação (6h)

```
Hoje 00:00 → backup_1.sql.gz
Hoje 06:00 → backup_2.sql.gz
Hoje 12:00 → backup_3.sql.gz
Hoje 18:00 → backup_4.sql.gz (4 backups, 1.2M cada)
───────────────────────────────
Amanhã 00:00 → backup_5.sql.gz (apaga backup_1)
Amanhã 06:00 → backup_6.sql.gz (apaga backup_2)
```

**Sempre mantém os 4 mais recentes = 24h de histórico**

---

## 🛠️ Comandos Manuais (Avançado)

### Backup manual via Docker

```bash
docker exec -t shortsai-db pg_dump -U postgres -d shortsai | gzip > backup.sql.gz
```

### Restaurar manual via Docker

```bash
gunzip -c backup.sql.gz | docker exec -i shortsai-db psql -U postgres -d shortsai
```

### Backup apenas schema

```bash
docker exec -t shortsai-db pg_dump -U postgres -d shortsai --schema-only > schema.sql
```

### Ver tamanho do banco

```bash
docker exec shortsai-db psql -U postgres -d shortsai -c "SELECT pg_size_pretty(pg_database_size('shortsai'));"
```

---

## 🆘 Troubleshooting

### Container não está rodando

```bash
docker ps | grep shortsai-db
docker-compose up -d db
```

### Cron não está executando

```bash
# Verificar se cron está ativo
systemctl status cron

# Ver logs do sistema
grep CRON /var/log/syslog | tail

# Testar backup manual
bash scripts/backup-rotate.sh
```

### Sem espaço em disco

```bash
# Ver espaço
df -h

# Limpar backups antigos manualmente
rm backups/shortsai_backup_ANTIGO.sql.gz
```

---

## 💡 Recomendações

### Para VPS de Produção:
✅ Backup automático a cada 6 horas  
✅ Baixar 1x por semana para PC local  
✅ Verificar logs semanalmente  
✅ Testar restauração mensalmente  

### Antes de Mudanças Críticas:
```bash
# Backup manual de segurança
bash scripts/backup-db.sh
```

---

## 📂 Estrutura de Arquivos

```
shortsai-api/
├── backups/              # Backups automáticos (últimos 4)
│   ├── shortsai_backup_20251207_000000.sql.gz
│   ├── shortsai_backup_20251207_060000.sql.gz
│   ├── shortsai_backup_20251207_120000.sql.gz
│   └── shortsai_backup_20251207_180000.sql.gz
├── scripts/
│   ├── backup-rotate.sh   # Backup automático rotativo
│   ├── backup-db.sh       # Backup manual simples
│   ├── restore-db.sh      # Restauração
│   └── setup-cron.sh      # Configurador de cron
└── logs/
    └── backup.log         # Histórico de execuções
```
