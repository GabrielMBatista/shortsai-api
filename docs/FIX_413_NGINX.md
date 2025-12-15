# Fix 413 Nginx - Instruções de Deploy

## 🔥 Problema
Erro `413 Request Entity Too Large` ao fazer upload de imagens para análise de personagens.

## ✅ Soluções Implementadas

### 1. **Next.js Config** (Já aplicado)
```typescript
// next.config.ts
experimental: {
  serverActions: {
    bodySizeLimit: '50mb'
  }
}
```

### 2. **Nginx Config** (Aplicar no servidor)

#### Opção A: Se usando nginx como reverse proxy no VPS

Editar `/etc/nginx/sites-available/shortsai` (ou seu arquivo de config):

```nginx
server {
    listen 80;
    server_name srv1161960.hstgr.cloud;

    # 🔥 FIX 413: Aumentar limite de upload
    client_max_body_size 50M;
    client_body_buffer_size 50M;

    location / {
        proxy_pass http://localhost:3333;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        
        # Timeouts para uploads grandes
        proxy_connect_timeout 600;
        proxy_send_timeout 600;
        proxy_read_timeout 600;
        send_timeout 600;
    }
}
```

#### Opção B: Se usando Docker Compose com nginx

Criar `nginx.conf` na raiz do backend:

```nginx
client_max_body_size 50M;
client_body_buffer_size 50M;
proxy_connect_timeout 600;
proxy_send_timeout 600;
proxy_read_timeout 600;
```

E adicionar ao `docker-compose.yml`:

```yaml
services:
  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
    volumes:
      - ./nginx.conf:/etc/nginx/conf.d/default.conf
    depends_on:
      - shortsai-api
```

## 🚀 Deploy

### Para VPS com nginx:

```bash
# 1. Editar config
sudo nano /etc/nginx/sites-available/shortsai

# 2. Adicionar: client_max_body_size 50M;

# 3. Testar config
sudo nginx -t

# 4. Recarregar nginx
sudo systemctl reload nginx

# 5. Rebuild da API (com novo next.config.ts)
cd /path/to/shortsai-api
docker compose down
docker compose build --no-cache shortsai-api
docker compose up -d
```

### Verificar:
```bash
# Ver logs do container
docker logs shortsai-api -f

# Testar endpoint
curl -X POST https://srv1161960.hstgr.cloud/api/ai/analyze-character \
  -H "Content-Type: application/json" \
  -d '{"test": "small payload"}'
```

## ✅ Checklist

- [x] Next.js bodySizeLimit aumentado (50MB)
- [ ] Nginx client_max_body_size configurado (50M)
- [ ] Container reconstruído com nova config
- [ ] Nginx recarregado
- [ ] Testado upload de imagem grande

## 📊 Limites Configurados

| Layer | Limite Anterior | Novo Limite |
|-------|----------------|-------------|
| Next.js | 1MB (padrão) | 50MB |
| Nginx | 1MB (padrão) | 50MB |
| Timeout | 60s | 600s |

## 🔍 Debugging

Se o erro persistir:

```bash
# Ver logs nginx
sudo tail -f /var/log/nginx/error.log

# Ver logs API
docker logs shortsai-api --tail 100

# Verificar tamanho do payload
# (no Chrome DevTools Network tab, ver "Request Payload")
```

## 📝 Notas

- O erro 413 vem do nginx, não do Next.js
- Next.js config resolve apenas parte do problema
- **Ação obrigatória**: Configurar nginx no servidor
