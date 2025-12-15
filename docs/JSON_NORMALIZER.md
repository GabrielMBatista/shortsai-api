# Sistema de Normalização Flexível de Personas

## 🎯 Objetivo

O sistema é **100% maleável** — aceita qualquer estrutura JSON definida pelas personas e converte automaticamente para o formato interno, garantindo total liberdade criativa.

## 📦 Arquitetura

### Componente Principal: `json-normalizer.ts`

Localização: `lib/ai/core/json-normalizer.ts`

**Responsabilidades:**
1. Detectar automaticamente o formato do JSON retornado pela persona
2. Normalizar para estrutura padrão interna
3. Preservar metadados originais
4. Calcular durações baseadas em densidade vocal (palavras/segundo)

### Formatos Suportados Nativamente

#### 1. **Formato Padrão do Sistema**
```json
{
  "videoTitle": "Título do Vídeo",
  "videoDescription": "Descrição...",
  "shortsHashtags": ["#shorts", "#viral"],
  "tiktokText": "...",
  "tiktokHashtags": ["#fyp"],
  "scenes": [
    {
      "sceneNumber": 1,
      "visualDescription": "...",
      "narration": "...",
      "durationSeconds": 5
    }
  ]
}
```

#### 2. **Formato Arquivo Éden v15 (Roteiro Único)**
```json
{
  "id_do_roteiro": {
    "meta": {
      "titulo_otimizado": "...",
      "citacao_chave": "...",
      "tema_espiritual": "...",
      "mensagem_nuclear": "..."
    },
    "hook_killer": "Hook inicial...",
    "scenes": [
      {
        "scene": 1,
        "visual": "...",
        "narration": "...",
        "duration": 4
      }
    ]
  }
}
```

#### 3. **Formato Aninhado Genérico**
```json
{
  "qualquer_id": {
    "title": "...",
    "scenes": [...]
  }
}
```

#### 4. **Formato Flat (Direto)**
```json
{
  "title": "...",
  "description": "...",
  "scenes": [...]
}
```

#### 5. **Formato Desconhecido (Fallback Inteligente)**
O sistema tenta extrair automaticamente:
- Busca por campos `scenes`, `script`, ou arrays de cenas em profundidade
- Detecta título em qualquer variação (`title`, `titulo`, `videoTitle`, `name`)
- Gera hashtags e metadados básicos automaticamente

## 🔧 Normalização de Cenas

### Campos Aceitos (Mapeamento Automático)

| Campo Interno | Variações Aceitas |
|---------------|-------------------|
| `sceneNumber` | `sceneNumber`, `scene_number`, `scene`, `number` |
| `visualDescription` | `visualDescription`, `visual_description`, `visual`, `imagePrompt`, `image_prompt`, `desc`, `description` |
| `narration` | `narration`, `audio`, `text`, `speech`, `voiceover`, `narration_text` |
| `durationSeconds` | `durationSeconds`, `duration_seconds`, `duration`, `durationSec` |

### Cálculo Automático de Duração

Se a cena não especifica duração explícita, o sistema calcula baseado na narração:

**Fórmula:** `duração = palavras ÷ 3.5`

- **Mínimo:** 3 segundos
- **Máximo:** 8 segundos (limite do Veo 2.0)

**Padrão:** 3.5 palavras/segundo (leitura reflexiva, conforme Arquivo Éden v15)

## 📝 Uso no Sistema

### 1. Script Service (Roteiros Únicos)

```typescript
// lib/ai/services/script-service.ts
import { normalizeScriptFormat } from '../core/json-normalizer';

const json = JSON.parse(aiResponse);
const normalized = normalizeScriptFormat(json, topic);

// normalized sempre terá a estrutura padrão, independente do formato original
```

### 2. Batch Import (Frontend)

```typescript
// shortsai-studio/src/hooks/video-generation/useProjectCreation.ts

// Semanas completas (já suportado)
if (parsed.cronograma) {
  // Processa diretamente (cada vídeo individual usa normalização no backend)
}

// Roteiros únicos (já normaliza)
if (parsed.scenes || parsed.id_do_roteiro) {
  const normalized = normalizeScenes(scenes);  
}
```

## ✅ Compatibilidade Garantida

### Personas que Funcionam 100%

1. ✅ **Biblical Storyteller (Éden v14)** - formato padrão
2. ✅ **Arquivo Éden v15** - formato `id_do_roteiro` + `meta`
3. ✅ **Qualquer persona customizada** - fallback genérico

### Novos Formatos

Para adicionar suporte explícito a um novo formato:

1. Detectar padrão único no JSON (ex: campo específico)
2. Adicionar detector em `normalizeScriptFormat()`
3. Criar função `normalizeXXXFormat()` específica
4. Testar com JSON real

**Exemplo:**
```typescript
// Adicionar em json-normalizer.ts

// Novo detector
if (json.meu_formato_customizado) {
    return normalizeMeuFormato(json, fallbackTopic);
}

// Nova função normalizadora
function normalizeMeuFormato(json: any, fallbackTopic: string): NormalizedScript {
    return {
        videoTitle: json.meu_formato_customizado.titulo,
        scenes: normalizeScenes(json.meu_formato_customizado.cenas),
        // ... mapeamento específico
    };
}
```

## 🎨 Preservação de Metadados

Todos os normalizadores preservam o JSON original em `metadata`:

```typescript
{
    videoTitle: "...",
    scenes: [...],
    metadata: { /* JSON original completo */ }
}
```

Isso permite:
- Análise posterior de campos customizados
- Debugging de formatos
- Rastreabilidade da persona usada

## 🧪 Testando Novas Personas

### 1. Via API `/api/ai/generate-script`

```bash
curl -X POST http://localhost:3000/api/ai/generate-script \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "...",
    "topic": "Teste de nova persona",
    "style": "cinematic",
    "language": "pt-BR",
    "personaId": "arquivo-eden-v15",
    "durationConfig": { "min": 20, "max": 30 }
  }'
```

### 2. Via Chat (Semana Completa)

```typescript
// Frontend chat
POST /api/chat/personas/{personaId}
{
  "message": "Gere cronograma semanal sobre fé e esperança"
}
```

### 3. Console Logs

O sistema loga automaticamente:
```
[JsonNormalizer] Detecting format...
[JsonNormalizer] Format detected: Arquivo Éden v15 (Single Script)
[ScriptService] ✅ Normalized successfully: 6 scenes
```

## 🔒 Regras de Segurança

1. **Nunca falhar silenciosamente** - se formato não é reconhecido, usa fallback genérico
2. **Sempre retornar cenas válidas** - mesmo que com valores padrão
3. **Preservar JSON original** - para debugging e auditoria
4. **Validar tipos** - converter strings para números quando necessário

## 📊 Métricas de Normalização

Campos monitorados automaticamente:
- Formato detectado
- Número de cenas normalizadas
- Campos faltantes que usaram fallback
- Metadados preservados

## 🚀 Roadmap

- [ ] Adicionar validação de schema opcional (Zod)
- [ ] Suporte a formatos de semana customizados
- [ ] Cache de detecção de formato por persona
- [ ] Métricas de performance de normalização
- [ ] UI de preview de JSON antes de importar

## 📞 Suporte

Para adicionar um novo formato ou reportar problemas:
1. Adicionar logs em `normalizeScriptFormat()`
2. Verificar console do backend
3. Adicionar detector específico se padrão identificado
4. Atualizar esta documentação
