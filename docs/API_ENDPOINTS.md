# 📡 API Endpoints - Personas & Channels

## 🎭 Personas

### GET /api/personas
Lista personas disponíveis para o usuário

**Auth:** Required  
**Response:**
```json
{
  "personas": [
    {
      "id": "storyteller",
      "name": "Storyteller",
      "type": "SYSTEM",
      "visibility": "PUBLIC",
      "category": "narrative",
      "isOfficial": true,
      "isFeatured": true,
      "isPremium": false
    }
  ],
  "total": 5
}
```

### GET /api/personas/:id
Obtém detalhes de uma persona

**Auth:** Required  
**Params:** `id` (persona ID)  
**Response:**
```json
{
  "id": "biblical-storyteller",
  "name": "Biblical Storyteller (Éden v14)",
  "systemInstruction": "...",
  "temperature": 0.75,
  "topP": 0.9,
  "creator": { "name": "System" }
}
```

### POST /api/personas
Cria persona CUSTOM

**Auth:** Required  
**Body:**
```json
{
  "name": "Meu Roteirista",
  "description": "Descrição...",
  "systemInstruction": "Você é...",
  "temperature": 0.8,
  "tags": ["custom", "test"]
}
```

### PATCH /api/personas/:id
Atualiza persona

**Auth:** Required (owner ou admin)  
**Params:** `id`  
**Body:** Partial fields  

---

## 📺 Channels

### GET /api/channels/user
Lista canais do usuário

**Auth:** Required  
**Response:**
```json
{
  "channels": [
    {
      "id": "uuid",
      "name": "Gospel Channel",
      "youtubeChannelId": "UCxxxx",
      "persona": {
        "id": "biblical-storyteller",
        "name": "Biblical Storyteller"
      },
      "subscriberCount": 1200,
      "videoCount": 50
    }
  ],
  "total": 2
}
```

### POST /api/channels/discover
Descobre canais YouTube da conta

**Auth:** Required  
**Body:**
```json
{
  "accountId": "google-account-uuid"
}
```
**Response:**
```json
{
  "channels": [
    {
      "youtubeChannelId": "UCxxxx",
      "name": "My Channel",
      "statistics": { "subscriberCount": 1000 }
    }
  ]
}
```

### POST /api/channels/import
Importa canal para o banco

**Auth:** Required  
**Body:**
```json
{
  "accountId": "account-uuid",
  "youtubeChannelId": "UCxxxx"
}
```

### PATCH /api/channels/:id/persona
Atribui persona ao canal

**Auth:** Required  
**Params:** `id` (channel ID)  
**Body:**
```json
{
  "personaId": "biblical-storyteller"
}
```
**Response:** Channel completo com persona

---

## 🔐 Auth & Permissions

**401 Unauthorized:** Sem sessão  
**403 Forbidden:** Sem permissão (plano, ownership)  
**404 Not Found:** Recurso não existe
