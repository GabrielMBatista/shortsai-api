# API Testing Guide - Personas & Channels

## 🧪 Setup

### Prerequisites
```bash
# 1. Start API server
cd shortsai-api
npm run dev

# 2. Get auth cookie (login via browser first)
# http://localhost:3333
# Copy cookie from DevTools
```

---

## 📋 Test Scenarios

### **Scenario 1: List Available Personas**

```bash
# GET /api/personas
curl http://localhost:3333/api/personas \
  -H "Cookie: next-auth.session-token=YOUR_TOKEN_HERE" \
  -v

# Expected Response (200):
{
  "personas": [
    {
      "id": "storyteller",
      "name": "Storyteller",
      "type": "SYSTEM",
      "category": "narrative",
      "isFeatured": true,
      "isPremium": false
    },
    // ... 4 more
  ],
  "total": 5
}

# Validation:
✓ Returns 5 personas for PRO users
✓ Returns 4 personas for FREE users (motivator excluded)
✓ All SYSTEM personas have type="SYSTEM"
✓ Featured personas appear first
```

---

### **Scenario 2: Get Persona Details**

```bash
# GET /api/personas/:id
curl http://localhost:3333/api/personas/biblical-storyteller \
  -H "Cookie: ..." \
  -v

# Expected Response (200):
{
  "id": "biblical-storyteller",
  "name": "Biblical Storyteller (Éden v14)",
  "systemInstruction": "MISSÃO: Gerar roteiros...",
  "temperature": 0.75,
  "topP": 0.9,
  "topK": 35,
  "maxOutputTokens": 8192,
  "category": "biblical",
  "isOfficial": true,
  "creator": null,
  "owner": null
}

# Validation:
✓ System instruction is complete
✓ Temperature, topP, topK are set
✓ Category is "biblical"
```

---

### **Scenario 3: Create Custom Persona (PRO Only)**

```bash
# POST /api/personas
curl -X POST http://localhost:3333/api/personas \
  -H "Cookie: ..." \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My Test Persona",
    "description": "Custom storyteller for tech content",
    "category": "tech",
    "systemInstruction": "You are a tech explainer...",
    "temperature": 0.8,
    "tags": ["tech", "custom"]
  }'

# Expected Response (201):
{
  "id": "uuid-generated",
  "type": "CUSTOM",
  "visibility": "PRIVATE",
  "ownerId": "user-id",
  "name": "My Test Persona",
  ...
}

# Expected Error (403) for FREE users:
{
  "error": "Limite de 0 personas atingido para o plano free"
}

# Validation:
✓ FREE users get 403
✓ PRO users can create up to 5
✓ Type is CUSTOM
✓ Visibility is PRIVATE
```

---

### **Scenario 4: Discover YouTube Channels**

```bash
# First, get your accountId
curl http://localhost:3333/api/users/me \
  -H "Cookie: ..."

# Copy the account.id from response

# POST /api/channels/discover
curl -X POST http://localhost:3333/api/channels/discover \
  -H "Cookie: ..." \
  -H "Content-Type: application/json" \
  -d '{
    "accountId": "YOUR_ACCOUNT_ID"
  }'

# Expected Response (200):
{
  "channels": [
    {
      "youtubeChannelId": "UCxxxxxx",
      "name": "My YouTube Channel",
      "email": "user@gmail.com",
      "thumbnail": "https://...",
      "statistics": {
        "subscriberCount": 1200,
        "videoCount": 45,
        "viewCount": "15000"
      }
    }
  ],
  "total": 1
}

# Expected Errors:
# 400: Missing accountId
# 401: Not authenticated
# 500: YouTube API error (invalid refresh token)
```

---

### **Scenario 5: Import Channel**

```bash
# POST /api/channels/import
curl -X POST http://localhost:3333/api/channels/import \
  -H "Cookie: ..." \
  -H "Content-Type: application/json" \
  -d '{
    "accountId": "YOUR_ACCOUNT_ID",
    "youtubeChannelId": "UCxxxxxx"
  }'

# Expected Response (201):
{
  "id": "channel-uuid",
  "userId": "user-id",
  "youtubeChannelId": "UCxxxxxx",
  "name": "My YouTube Channel",
  "subscriberCount": 1200,
  "videoCount": 45,
  "persona": null,
  "lastSyncedAt": "2024-12-12T13:00:00.000Z"
}

# Validation:
✓ Channel created in database
✓ Stats cached
✓ personaId is null initially
```

---

### **Scenario 6: Assign Persona to Channel**

```bash
# PATCH /api/channels/:id/persona
curl -X PATCH http://localhost:3333/api/channels/CHANNEL_UUID/persona \
  -H "Cookie: ..." \
  -H "Content-Type: application/json" \
  -d '{
    "personaId": "biblical-storyteller"
  }'

# Expected Response (200):
{
  "id": "channel-uuid",
  "personaId": "biblical-storyteller",
  "persona": {
    "id": "biblical-storyteller",
    "name": "Biblical Storyteller (Éden v14)",
    "type": "SYSTEM",
    "category": "biblical"
  },
  ...
}

# Expected Error (403):
{
  "error": "Sem acesso a esta persona"
}

# Validation:
✓ Channel.personaId updated
✓ Persona is included in response
✓ Can set to null (remove persona)
```

---

### **Scenario 7: Create Project with Channel**

```bash
# POST /api/projects
curl -X POST http://localhost:3333/api/projects \
  -H "Cookie: ..." \
  -H "Content-Type: application/json" \
  -d '{
    "topic": "Ansiedade e Fé",
    "style": "default",
    "language": "pt-BR",
    "voice_name": "pt-BR-Standard-A",
    "tts_provider": "gemini",
    "channel_id": "CHANNEL_UUID",
    "duration_config": {
      "min": 70,
      "max": 90
    }
  }'

# Expected Response (201):
{
  "id": "project-uuid",
  "topic": "Ansiedade e Fé",
  "channel_id": "channel-uuid",
  "persona_id": "biblical-storyteller",
  "persona_version": 1,
  "status": "draft",
  "persona": {
    "id": "biblical-storyteller",
    "name": "Biblical Storyteller",
    "type": "SYSTEM",
    "category": "biblical"
  },
  ...
}

# Validation:
✓ persona_id inherited from channel
✓ persona_version captured
✓ Persona included in response
```

---

### **Scenario 8: Check Persona Usage Logs**

```bash
# Query database directly
docker exec -it shortsai-db psql -U postgres -d postgres \
  -c "SELECT * FROM persona_usage_logs ORDER BY created_at DESC LIMIT 5;"

# Expected:
persona_id              | user_id | action             | success | duration
-----------------------|---------|--------------------|---------|---------
biblical-storyteller   | user-1  | script_generation  | true    | 5200

# Validation:
✓ Log created after script generation
✓ Success = true if generation worked
✓ Duration captured in ms
✓ Metadata contains topic, channelId
```

---

### **Scenario 9: Check Persona Stats**

```bash
# Query persona usage count
curl http://localhost:3333/api/personas/biblical-storyteller \
  -H "Cookie: ..."

# Response should show incremented usageCount:
{
  "usageCount": 1,
  "lastUsedAt": "2024-12-12T14:00:00.000Z"
}
```

---

## ✅ Test Checklist

```
Personas:
☐ List personas (FREE vs PRO)
☐ Get persona details
☐ Create custom persona (PRO)
☐ Create custom persona fails (FREE)
☐ Update persona (owner only)

Channels:
☐ Discover channels from Google
☐ Import channel
☐ List user channels
☐ Assign persona to channel
☐ Remove persona from channel

Integration:
☐ Create project with channel
☐ Persona inherited from channel
☐ Usage log created
☐ Usage count incremented
☐ Anti-repetition works (5+ projects)

Errors:
☐ 401 for unauthorized
☐ 403 for forbidden resources
☐ 404 for not found
☐ 400 for validation errors
```

---

## 🐛 Common Issues

### Issue: "Missing refresh token"
```
Error in discover/import channels
Solution: Reconnect Google Account with YouTube scope
```

### Issue: "Limite atingido"
```
Free user trying to create custom persona
Solution: Upgrade to PRO plan
```

### Issue: "Persona not found"
```
Trying to assign non-existent persona
Solution: Use valid persona ID from /api/personas
```

---

## 📊 Performance Benchmarks

```
List Personas:        < 100ms
Get Persona:          < 50ms
Discover Channels:    1-3s (YouTube API)
Import Channel:       500ms-1s
Assign Persona:       < 100ms
Create Project:       5-10s (script generation)
```
