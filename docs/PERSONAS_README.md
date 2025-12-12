# Personas & Channels System

Sistema de roteiristas IA (Personas) e gestão de canais YouTube (Channels) com anti-repetição automática.

## 🎯 Features

- **5 Personas SYSTEM** pré-configuradas (Biblical Storyteller, Educator, Storyteller, Entertainer, Motivator)
- **Personas CUSTOM** (PRO: 5, ENTERPRISE: ilimitado, FREE: 0)
- **Sync com YouTube API** (descobrir e importar canais)
- **Anti-repetição automática** (analisa últimos 5 projetos do canal)
- **Tracking de uso** (logs de performance por persona)
- **Versionamento** (histórico de mudanças)

## 📊 Database

Ver arquitetura completa: [DATABASE_DIAGRAM.md](./DATABASE_DIAGRAM.md)

**Models principais:**
- `Persona` - Roteiristas IA com systemInstruction
- `Channel` - Canais YouTube vinculados
- `PersonaHistory` - Versionamento
- `PersonaUsageLog` - Tracking de uso
- `ChannelAnalytics` - Métricas (futuro)

## 📡 API Endpoints

Ver referência completa: [API_ENDPOINTS.md](./API_ENDPOINTS.md)

**Personas:**
```
GET    /api/personas              # Lista disponíveis (filtrado por plano)
POST   /api/personas              # Cria CUSTOM
GET    /api/personas/:id
PATCH  /api/personas/:id
```

**Channels:**
```
GET    /api/channels/user         # Lista canais do usuário
POST   /api/channels/discover     # Descobre via Google Account
POST   /api/channels/import       # Importa canal
PATCH  /api/channels/:id/persona  # Atribui persona
```

**Projects (atualizado):**
```
POST   /api/projects              # Aceita channel_id + persona_id
```

## 🚀 Como Usar

### 1. Listar Personas Disponíveis
```typescript
const personas = await prisma.persona.findMany({
  where: {
    type: 'SYSTEM',
    visibility: 'PUBLIC',
    requiredPlan: 'free' // ou user.plan
  }
});
```

### 2. Importar Canal YouTube
```typescript
// Descobrir
const channels = await ChannelService.discoverChannels(userId, accountId);

// Importar
const channel = await ChannelService.importChannel(
  userId,
  accountId,
  youtubeChannelId
);
```

### 3. Atribuir Persona ao Canal
```typescript
await ChannelService.assignPersona(
  channelId,
  userId,
  'biblical-storyteller'
);
```

### 4. Gerar Script com Persona
```typescript
const script = await ScriptService.generateScript(
  userId,
  topic,
  style,
  language,
  durationConfig,
  keys,
  {
    personaId: 'biblical-storyteller', // Ou null para usar do canal
    channelId: 'uuid-do-canal'
  }
);
// Anti-repetição aplicada automaticamente
// Tracking criado em PersonaUsageLog
```

## 🔧 Services

### PersonaService
```typescript
getAvailablePersonas(userId)     // Filtrado por plano
getPersona(personaId)
canAccessPersona(userId, personaId)
createCustomPersona(userId, data)
updatePersona(personaId, userId, data)
trackUsage(personaId, userId, projectId, success, duration)
```

### ChannelService
```typescript
discoverChannels(userId, accountId)
importChannel(userId, accountId, youtubeChannelId)
getUserChannels(userId)
assignPersona(channelId, userId, personaId)
syncChannelStats(channelId)
```

## 🌱 Seeds

Para popular personas padrão:
```bash
npm run seed:personas
```

Cria 5 personas:
- `storyteller` (FREE)
- `educator` (FREE)
- `entertainer` (FREE)
- `biblical-storyteller` (FREE) ⭐
- `motivator` (PRO) 💎

## 📚 Documentação Adicional

- **OpenAPI Spec:** [openapi.yaml](./openapi.yaml)
- **Database Diagram:** [DATABASE_DIAGRAM.md](./DATABASE_DIAGRAM.md)
- **API Reference:** [API_ENDPOINTS.md](./API_ENDPOINTS.md)

## ⚡ Performance

- Personas cacheadas em memória
- Stats de canais cacheadas no banco
- Anti-repetição: < 100ms (query 5 projetos)
- Tracking assíncrono (não bloqueia geração)

## 🔐 Permissões

| Plano | CUSTOM Personas | Acesso SYSTEM |
|-------|-----------------|---------------|
| FREE | 0 | Todas não-premium |
| PRO | 5 | Todas |
| ENTERPRISE | Ilimitado | Todas |

## 🎯 Próximos Passos

- [ ] Frontend (PersonaGallery, ChannelsPage)
- [ ] Analytics dashboard
- [ ] A/B Testing
- [ ] Auto-otimização (ML)
- [ ] TikTok integration
