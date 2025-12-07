# 🧠 ShortsAI API

> **Motor de Orquestração Backend para o ShortsAI Studio**

Este é o serviço backend para o ShortsAI Studio, construído com **Next.js App Router**, **Prisma ORM** e **PostgreSQL**. Ele gerencia a orquestração de projetos, fluxos de workflow e agora conta com uma arquitetura híbrida de renderização de vídeo.

## 🏛️ Arquitetura Híbrida

O sistema foi refatorado para alta escalabilidade:

1.  **API (Next.js - VPS):** Gerencia lógica de negócios, banco de dados (PostgreSQL), usuários.
2.  **Worker (Python - Google Cloud Run):** Microsserviço dedicado e serverless para renderização pesada de vídeos usando MoviePy + FFmpeg.

A comunicação segue o fluxo:
`Frontend -> API (Queue Job) -> Cloud Run (Render) -> Webhook (Status Update) -> API -> Frontend (Polling)`

## ✨ Funcionalidades Principais

*   **Orquestração de Workflow**: Gerencia tarefas de geração complexas (Roteiro -> Imagens -> Áudio -> Vídeo).
*   **Worker Escalável**: Renderização de vídeos movida para o Google Cloud Run (ou VPS Docker).
    > **Nota:** O uso do Cloud Run no nível gratuito (Free Tier) pode apresentar desempenho limitado (Cold Starts, CPU throttling) para renderização de vídeo. Para produção em alta escala, recomenda-se instâncias dedicadas.
*   **Controle de Concorrência**: Bloqueio de projeto e filas de processamento resilientes.
*   **Atualizações em Tempo Real**: O frontend realiza polling eficiente para acompanhar o progresso.
*   **R2 Storage**: Armazenamento de assets (vídeos, áudios, imagens) no Cloudflare R2 com zero custo de egresso.

## 🛠️ Tech Stack

*   **API**: Next.js 15, PostgreSQL, Prisma.
*   **Worker**: Python, FastAPI, MoviePy, Docker.
*   **Infra**: Docker Compose (VPS), Google Cloud Run (Serverless).

## 🚀 Começando

### Pré-requisitos
*   Node.js v18+
*   Docker & Docker Compose

### Instalação

1.  Clone o repositório e configure o `.env`:
    ```bash
    cp .env.example .env
    # Preencha as credenciais do DB, R2 e IA.
    # Adicione CLOUD_RUN_URL apontando para o worker (ou localhost:8080 para dev local)
    ```

2.  Suba o ambiente local:
    ```bash
    docker-compose up -d --build
    ```
    Isso subirá a API (3333), o Banco (5432) e o Worker (8080) se estiver rodando localmente.

## ☁️ Deploy

### API & Banco (VPS)
O deploy da API é automatizado via **GitHub Actions** (`deploy.yml`). Ao fazer push na `master`, ele conecta na VPS via SSH, puxa o código e reinicia os containers `shortsai-api` e `db`.

### Worker (Google Cloud Run)
O deploy do Worker é automatizado via **GitHub Actions** (`deploy-worker.yml`). Ao alterar arquivos na pasta `worker/`:
1.  Constrói a imagem Docker.
2.  Envia para o Google Artifact Registry.
3.  Atualiza o serviço no Cloud Run.

### Configuração de Variáveis (VPS)
No servidor de produção, o arquivo `.env` deve conter:
```ini
CLOUD_RUN_URL=https://shortsai-worker-xyz.run.app
WORKER_SECRET=sua_chave_segura
```
Isso garante que a API saiba para onde despachar os jobs de vídeo.

## 📚 Documentação

### Guias Disponíveis

- **[Integração Frontend](./FRONTEND_INTEGRATION.md)** - Guia completo de integração entre Frontend e API
  - Workflow e comandos
  - Polling de atualizações
  - Proxy de assets R2
  - Geração de roteiro e análise de personagens

- **[Worker Python](./worker/README.md)** - Microsserviço de renderização de vídeo
  - Setup local
  - Deploy para Cloud Run
  - Configurações de ambiente

- **[Backup do Banco](./docs/BACKUP.md)** - Sistema automatizado de backup PostgreSQL
  - Setup inicial na VPS (uma vez)
  - Backup automático a cada 6h
  - Restauração de backups

### Endpoints Principais da API

*   `POST /api/workflow/command` - Enviar comandos de geração (generate_all, regenerate_image, etc)
*   `GET /api/projects/[id]` - Buscar projeto e fazer polling de status
*   `POST /api/ai/generate` - Gerar roteiro ou analisar personagens
*   `GET /api/assets?url=` - Proxy para assets R2 (solução de CORS)
*   `POST /api/render` - Enfileirar job de renderização
*   `GET /api/render/[id]` - Status do job
*   `POST /api/webhooks/job-status` - Webhook do Worker

### Quick Start: Backup Automático

```bash
# Na VPS após deploy
chmod +x scripts/*.sh
bash scripts/setup-cron.sh
# Escolha opção 1 (backup a cada 6h)
```

---
Desenvolvido para ShortsAI Studio.
