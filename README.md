# 🧠 ShortsAI API

> **Motor de Orquestração Backend para o ShortsAI Studio**

Este é o serviço backend para o ShortsAI Studio, construído com **Next.js App Router**, **Prisma ORM** e **PostgreSQL**. Ele gerencia a orquestração de projetos, fluxos de workflow e agora conta com uma arquitetura híbrida de renderização de vídeo.

## 🏛️ Arquitetura Híbrida

O sistema foi refatorado para alta escalabilidade:

1.  **API (Next.js - VPS):** Gerencia lógica de negócios, banco de dados (PostgreSQL), usuários.
2.  **Worker (Python - VPS):** Microsserviço dedicado para renderização pesada de vídeos usando MoviePy + FFmpeg, rodando no mesmo Docker Compose da API.

A comunicação segue o fluxo:
`Frontend -> API (Queue Job) -> Worker (Render) -> Webhook (Status Update) -> API -> Frontend (Polling)`

## ✨ Funcionalidades Principais

*   **Orquestração de Workflow**: Gerencia tarefas de geração complexas (Roteiro -> Imagens -> Áudio -> Vídeo).
*   **Worker Server-Side**: Renderização de vídeos local (VPS) para evitar latência e custos.
    > **Nota:** O código ainda suporta Google Cloud Run, mas foi descontinuado em produção devido à lentidão do Free Tier.
*   **Controle de Concorrência**: Bloqueio de projeto e filas de processamento resilientes.
*   **Atualizações em Tempo Real**: O frontend realiza polling eficiente para acompanhar o progresso.
*   **R2 Storage**: Armazenamento de assets (vídeos, áudios, imagens) no Cloudflare R2 com zero custo de egresso.

## 🛠️ Tech Stack

*   **API**: Next.js 15, PostgreSQL, Prisma.
*   **Worker**: Python, FastAPI, MoviePy, Docker.
*   **Infra**: Docker Compose (VPS).

## 🚀 Começando

### Pré-requisitos
*   Node.js v18+
*   Docker & Docker Compose

### Instalação

1.  Clone o repositório e configure o `.env`:
    ```bash
    cp .env.example .env
    # Preencha as credenciais do DB, R2 e IA.
    # WORKER_URL=http://worker:8080 (Comunicação interna Docker)
    ```

2.  Suba o ambiente local:
    ```bash
    docker-compose up -d --build
    ```
    Isso subirá API, Banco, Redis e Worker.

## ☁️ Deploy

### Servidor Completo (VPS)
O deploy é automatizado via **GitHub Actions**. O script `deploy.yml` atualiza e reinicia todos os containers (`api`, `worker`, `db`) definidos no `docker-compose.yml` da VPS.

### Worker (Cloud Run - Legado/Exemplo)
Existe a possibilidade de deploy serverless (`deploy-worker.yml`), mas atualmente optamos pelo Worker no Docker Compose para melhor performance de I/O em vídeo.

### Configuração de Variáveis (VPS)
No servidor de produção, o arquivo `.env` deve conter:
```ini
WORKER_URL=http://shortsai-worker:8080
WORKER_SECRET=sua_chave_segura
```
Isso garante que a API despache os jobs diretamente para o container do worker na mesma rede.

## 📚 Documentação

### Guias Disponíveis

- **[Integração Frontend](./docs/FRONTEND_INTEGRATION.md)** - Guia completo de integração entre Frontend e API
  - Workflow e comandos
  - Polling de atualizações
  - Proxy de assets R2

### Repositório Frontend
Esta API serve o frontend **ShortsAI Studio**. 
Para a aplicação completa, clone também: [https://github.com/seu-usuario/shortsai-studio](https://github.com/seu-usuario/shortsai-studio)
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
