# Guia de Integração Frontend: Novo Workflow e Chaves de API

## Visão Geral
A lógica de geração foi movida para o backend para garantir segurança e robustez. O frontend não gera mais assets diretamente, mas envia comandos para o backend. As chaves de API ainda podem ser fornecidas pelo frontend (ex: do armazenamento local ou configurações) e serão usadas de forma segura pelo backend.

## 1. Enviando Comandos
Use o endpoint `/api/workflow/command` para controlar o processo de geração.

### Endpoint
`POST /api/workflow/command`

### Estrutura do Payload
```typescript
interface WorkflowCommand {
    projectId: string;
    sceneId?: string; // Obrigatório para regeneração de asset único
    action: 'generate_all' | 'regenerate_image' | 'regenerate_audio' | 'pause' | 'resume' | 'cancel';
    force?: boolean; // Se true, sobrescreve assets existentes
    apiKeys?: {
        gemini?: string;
        elevenlabs?: string;
    };
}
```

### Exemplos

#### A. Iniciar Geração Completa (Generate All)
```typescript
const startGeneration = async (projectId: string, keys: { gemini?: string, elevenlabs?: string }) => {
    await fetch('/api/workflow/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            projectId,
            action: 'generate_all',
            force: true, // Opcional: reinicia do zero
            apiKeys: keys
        })
    });
};
```

#### B. Regenerar Imagem Única
```typescript
const regenerateImage = async (projectId: string, sceneId: string, keys: { gemini?: string }) => {
    await fetch('/api/workflow/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            projectId,
            sceneId,
            action: 'regenerate_image',
            force: true,
            apiKeys: keys
        })
    });
};
```

#### C. Regenerar Áudio Único
```typescript
const regenerateAudio = async (projectId: string, sceneId: string, keys: { elevenlabs?: string }) => {
    await fetch('/api/workflow/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            projectId,
            sceneId,
            action: 'regenerate_audio',
            force: true,
            apiKeys: keys
        })
    });
};
```

## 2. Polling para Atualizações
O frontend deve fazer polling do status do projeto para refletir as mudanças em tempo real.

### Endpoint
`GET /api/projects/{id}`

### Lógica
1.  Faça polling a cada 2-5 segundos enquanto `project.status === 'generating'`.
2.  Atualize a UI com o array `scenes` retornado, que contém `image_url`, `audio_url`, `image_status` e `audio_status`.
3.  Pare o polling quando `project.status` for `completed`, `failed` ou `paused`.

## 3. Principais Mudanças do Fluxo Anterior
1.  **Sem Geração Client-Side**: Não chame `AIService` ou APIs externas (OpenAI, ElevenLabs) diretamente do navegador.
2.  **Fire and Forget**: O endpoint `command` retorna imediatamente. Ele *não* espera a geração terminar.

## 4. Ferramentas de IA Pré-Workflow
Para tarefas que acontecem *antes* de um projeto ser criado (como gerar o roteiro ou analisar personagens), use o endpoint genérico de IA.

### Endpoint
`POST /api/ai/generate`

### Ações

#### A. Gerar Roteiro
```typescript
const generateScript = async (userId: string, topic: string, style: string, language: string, durationConfig: any, keys: { gemini?: string }) => {
    const res = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            userId,
            action: 'generate_script',
            params: { topic, style, language, durationConfig },
            apiKeys: keys
        })
    });
    const data = await res.json();
    return data.result; // Retorna objeto de roteiro JSON genérico
};
```

#### B. Analisar Personagem (para avatares consistentes)
```typescript
const analyzeCharacter = async (userId: string, base64Image: string, keys: { gemini?: string }) => {
    const res = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            userId,
            action: 'analyze_character',
            params: { base64Image },
            apiKeys: keys
        })
    });
    const data = await res.json();
    return data.result; // Retorna descrição em string
};
```

#### C. Otimizar Imagem de Referência (Headshot)
```typescript
const optimizeImage = async (userId: string, base64Image: string, keys: { gemini?: string }) => {
    const res = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            userId,
            action: 'optimize_image',
            params: { base64Image },
            apiKeys: keys
        })
    });
    const data = await res.json();
    return data.result; // Retorna URI de dados base64
};
```
