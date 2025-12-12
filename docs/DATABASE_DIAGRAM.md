# 🗄️ Database Architecture - Personas & Channels

## 📊 Entity Relationship Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                        CORE ENTITIES                        │
└─────────────────────────────────────────────────────────────┘

┌──────────────┐         ┌──────────────┐         ┌──────────────┐
│     User     │1      N │   Channel    │N      1 │   Persona    │
│──────────────│─────────│──────────────│─────────│──────────────│
│ id           │         │ id           │         │ id           │
│ email        │         │ user_id      │         │ type         │
│ name         │         │ youtube_ch_id│         │ name         │
│ role         │         │ persona_id   │◄────────│ sys_instruct │
│ plan_id      │         │ name         │         │ temperature  │
└──────────────┘         │ thumbnail    │         │ topP, topK   │
       │                 │ stats (cache)│         │ is_official  │
       │                 └──────────────┘         └──────────────┘
       │                        │                         │
       │                        │                         │
       │1                       │N                        │N
       │                        │                         │
       │                 ┌──────────────┐                 │
       │                 │   Project    │                 │
       │                 │──────────────│                 │
       └─────────────────│ id           │─────────────────┘
                        N│ user_id      │1
                         │ channel_id   │◄─── opcional
                         │ persona_id   │◄─── opcional
                         │ topic        │
                         │ status       │
                         └──────────────┘
                                │1
                                │
                                │N
                         ┌──────────────┐
                         │    Scene     │
                         │──────────────│
                         │ project_id   │
                         │ visual_desc  │
                         │ narration    │
                         │ image_status │
                         │ audio_status │
                         └──────────────┘

┌─────────────────────────────────────────────────────────────┐
│                     ANALYTICS ENTITIES                      │
└─────────────────────────────────────────────────────────────┘

┌──────────────┐         ┌──────────────────────┐
│   Channel    │1      N │  ChannelAnalytics    │
│──────────────│─────────│──────────────────────│
│ id           │         │ channel_id           │
└──────────────┘         │ date                 │
                         │ period (DAY/WEEK)    │
                         │ views, likes, etc    │
                         │ avg_retention        │
                         │ avg_ctr              │
                         └──────────────────────┘

┌──────────────┐         ┌──────────────────────┐
│   Persona    │1      N │  PersonaUsageLog     │
│──────────────│─────────│──────────────────────│
│ id           │         │ persona_id           │
└──────────────┘         │ user_id              │
                         │ project_id           │
                         │ action               │
                         │ success              │
                         │ duration             │
                         └──────────────────────┘

┌──────────────┐         ┌──────────────────────┐
│   Persona    │1      N │  PersonaHistory      │
│──────────────│─────────│──────────────────────│
│ id           │         │ persona_id           │
└──────────────┘         │ version              │
                         │ snapshot (JSON)      │
                         │ changed_by           │
                         │ change_reason        │
                         └──────────────────────┘
```

## 🔑 Key Relationships

### User → Channel (1:N)
- Usuário pode ter múltiplos canais
- Canal vinculado a Account (Google OAuth)
- Canal tem persona atribuída (opcional)

### Channel → Persona (N:1)
- Cada canal usa UMA persona
- Mesma persona pode ser usada por vários canais
- Persona determina estilo de geração

### Project → Channel (N:1)
- Projeto pode ser vinculado a canal (opcional)
- Se vinculado, herda persona do canal
- Permite organização por destino

### Project → Persona (N:1)
- Projeto rastreia qual persona gerou
- Permite analytics de performance
- Versionamento para auditoria

## 📈 Data Flow

```
1. User Setup
   User → connects Google → Account created
   ↓
   discovers YouTube channels
   ↓
   imports → Channel records created

2. Channel Configuration
   User → selects Channel
   ↓
   assigns Persona (SYSTEM or CUSTOM)
   ↓
   Channel.persona_id = Persona.id

3. Content Generation
   User → creates Project
   ↓
   selects Channel (optional)
   ↓
   ScriptService.generate(personaId: Channel.persona_id)
   ↓
   Project created with channel_id + persona_id

4. Analytics Collection
   Worker (daily) → YouTube API
   ↓
   fetch video stats
   ↓
   ChannelAnalytics record created
   ↓
   Performance calculated by Persona

5. Optimization Loop
   System → analyzes PersonaUsageLog
   ↓
   identifies best performing Personas
   ↓
   suggests to user OR auto-optimizes
```

## 🔒 Constraints & Indexes

### Primary Keys
- All tables: UUID

### Unique Constraints
- `channels`: (user_id, youtube_channel_id)
- `persona_history`: (persona_id, version)
- `channel_analytics`: (channel_id, date, period)

### Foreign Keys (Cascade Rules)
- `channels.user_id` → ON DELETE CASCADE
- `channels.persona_id` → ON DELETE SET NULL
- `projects.channel_id` → ON DELETE SET NULL
- `projects.persona_id` → ON DELETE SET NULL
- `persona_history.persona_id` → ON DELETE CASCADE

### Indexes (Performance)
- `personas`: (type, visibility, required_plan)
- `channels`: (user_id), (persona_id)
- `projects`: (channel_id), (persona_id)
- `persona_usage_logs`: (persona_id, created_at)
- `channel_analytics`: (channel_id, date)

## 📊 Storage Estimates

| Table | Avg Row Size | Expected Rows | Total Size |
|-------|--------------|---------------|------------|
| personas | 5KB | 100 | 500KB |
| channels | 1KB | 10K | 10MB |
| projects | 2KB | 100K | 200MB |
| persona_history | 6KB | 500 | 3MB |
| channel_analytics | 0.5KB | 300K | 150MB |
| persona_usage_logs | 0.3KB | 500K | 150MB |

**Total Estimated:** ~500MB (first year)
