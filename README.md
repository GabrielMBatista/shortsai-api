# 🧠 ShortsAI API

> **Motor de Orquestração Backend para o ShortsAI Studio**

Este é o serviço backend para o ShortsAI Studio, construído com **Next.js App Router**, **Prisma ORM** e **PostgreSQL**. Ele gerencia a orquestração de projetos, fluxos de trabalho de geração de assets, gerenciamento de usuários e atualizações em tempo real via Server-Sent Events (SSE).

> **Nota de Arquitetura**: A escolha do **Next.js** para o backend foi estratégica para validar a viabilidade de hospedar um backend funcional e escalável diretamente na infraestrutura da **Vercel**, aproveitando suas capacidades de Serverless e Edge Functions.

## ✨ Funcionalidades Principais

*   **Orquestração de Workflow**: Gerencia tarefas de geração complexas e em várias etapas (Roteiro -> Imagens -> Áudio -> Música) com tratamento de dependências e lógica de repetição (retry).
*   **Controle de Concorrência**: Implementa **Bloqueio de Projeto** (`/lock` / `/unlock`) para evitar condições de corrida durante o uso em múltiplas abas ou edições rápidas.
*   **Idempotência e Rastreamento de Uso**: O registro de uso deduplicado garante o consumo preciso da cota, mesmo com repetições de rede.
*   **Estratégia de Monetização**: O motor de geração de roteiros (`gemini-2.5-flash`) é ajustado para produzir conteúdo estritamente entre **65s-90s** por padrão, maximizando a elegibilidade para monetização.
*   **Atualizações em Tempo Real**: Usa **Server-Sent Events (SSE)** para enviar atualizações granulares de progresso (ex: "Gerando Imagem para a Cena 3...") para o frontend.
*   **Arquitetura de Soft Delete**: Implementa exclusão segura para cenas e projetos usando timestamps `deleted_at`, prevenindo perda acidental de dados.
*   **Integração Híbrida de IA**: Orquestra chamadas para o Google Gemini 2.5, ElevenLabs, Groq e outros provedores de IA.
*   **Esquema de Banco de Dados Robusto**: Esquema PostgreSQL totalmente tipado com Prisma, suportando relações complexas (Projetos, Cenas, Personagens, Logs de Uso).

## 🛠️ Tech Stack

*   **Framework**: Next.js 15 (App Router)
*   **Banco de Dados**: PostgreSQL
*   **ORM**: Prisma
*   **Estilo de API**: REST + SSE
*   **Linguagem**: TypeScript

## 🚀 Começando

### Pré-requisitos

*   Node.js v18+
*   Banco de Dados PostgreSQL (Local ou Cloud como Supabase/Neon)

### Instalação

1.  Clone o repositório:
    ```bash
    git clone <repository-url>
    cd shortsai-api
    ```

2.  Instale as dependências:
    ```bash
    npm install
    ```

3.  Configure as Variáveis de Ambiente:
    Crie um arquivo `.env` no diretório raiz:
    ```env
    DATABASE_URL="postgresql://user:password@localhost:5432/shortsai"
    NEXT_PUBLIC_APP_URL="http://localhost:3000"
    ELEVENLABS_API_KEY="sua-chave-aqui"
    GEMINI_API_KEY="sua-chave-aqui"
    GROQ_API_KEY="sua-chave-aqui"
    ```

4.  Inicialize o Banco de Dados:
    ```bash
    # Execute as migrações
    npx prisma migrate dev

    # Popule com dados iniciais (opcional)
    npx prisma db seed
    ```

5.  Execute o Servidor de Desenvolvimento:
    ```bash
    npm run dev
    ```

    A API estará disponível em `http://localhost:3000`.

### 🐳 Executando com Docker

O projeto inclui um `docker-compose.yml` para orquestrar todo o ambiente (API, Banco de Dados e Frontend).

**Nota**: O arquivo `docker-compose.yml` assume que o diretório `shortai-studio` está localizado ao lado deste diretório (`../shortai-studio`).

#### 1. Configuração (Banco de Dados)

*   **Opção A: Banco Externo (Produção/Padrão)**
    Crie um arquivo `.env` neste diretório com sua `DATABASE_URL` externa. O container do banco local **não** será iniciado.
    ```bash
    docker-compose up -d --build
    ```

*   **Opção B: Banco Local (Desenvolvimento)**
    Para iniciar um container Postgres local junto com a aplicação:
    ```bash
    docker-compose --profile local up -d --build
    ```

#### 2. Serviços Disponíveis

*   **API**: http://localhost:3333
*   **Frontend**: http://localhost:3000
*   **Banco (Local)**: Porta 5432

## 📚 Documentação da API

### Endpoints Principais

*   **Projetos**
    *   `GET /api/projects`: Lista projetos (filtra cenas com soft-delete).
    *   `POST /api/projects`: Cria um novo projeto.
    *   `GET /api/projects/[id]`: Obtém detalhes completos do projeto.
    *   `PATCH /api/projects/[id]`: Atualiza metadados do projeto.

*   **Cenas**
    *   `PATCH /api/scenes/[id]`: Atualiza conteúdo da cena.
    *   `DELETE /api/scenes/[id]`: Realiza soft delete em uma cena.

*   **Workflow**
    *   `POST /api/workflow/command`: Dispara ações (generate_all, regenerate_image, etc.).
    *   `GET /api/events/[projectId]`: Endpoint SSE para status em tempo real.

*   **Usuários e Assets**
    *   `POST /api/users`: Sincroniza perfil de usuário.
    *   `POST /api/characters`: Gerencia personagens consistentes.

## 🛡️ Gerenciamento de Banco de Dados

*   **Migração**: `npx prisma migrate dev --name <nome_da_migracao>`
*   **Studio (GUI)**: `npx prisma studio`
*   **Gerar Client**: `npx prisma generate` (Execute após alterações no schema)

## 🔄 Arquitetura de Workflow

O backend usa um padrão de **dispatcher sem estado (stateless)**.
1.  O Frontend envia um comando (`/api/workflow/command`).
2.  O Backend atualiza o status no DB para `queued` (na fila) ou `pending` (pendente).
3.  O Dispatcher encontra a próxima tarefa disponível e aciona um worker em segundo plano (`/api/workflow/process`).
4.  O Worker executa a tarefa de IA e atualiza o DB.
5.  As atualizações são transmitidas para o frontend via SSE.

---

Desenvolvido para ShortsAI Studio.
