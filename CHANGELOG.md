# Changelog

Todas as mudanças significativas neste projeto serão documentadas neste arquivo.

O formato é baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/),
e este projeto adere ao [Versionamento Semântico](https://semver.org/lang/pt-BR/).

## [Unreleased]

### Adicionado
- **Cloudflare R2 Storage Integration**: Integração completa com Cloudflare R2 para armazenamento de assets
  - Endpoint `/api/assets` para proxy de assets do R2
  - Upload automático de assets gerados para R2
  - Suporte a vídeos, imagens e áudios
  - Headers CORS configurados para uso com Canvas/WebCodecs
  - Cache imutável (1 ano) para performance

- **Deploy Automatizado**: GitHub Actions workflow para deploy em VPS
  - Atualização automática de código via `git pull`
  - Rebuild automático de containers Docker
  - Verificação de saúde da API após deploy
  - Deploy acionado automaticamente em push para `master`

- **Documentação Expandida**:
  - Seção sobre integração com R2 Storage no README
  - Guia de uso do endpoint `/api/assets` no FRONTEND_INTEGRATION.md
  - Exemplos de uso do proxy para exportação de vídeo
  - Documentação do workflow de deploy automatizado
  - Arquivo `.env.example` atualizado com todas as variáveis necessárias

### Modificado
- **GitHub Actions Workflow**: Corrigido para incluir `git pull` antes do rebuild
  - Anteriormente: Buildava código antigo do VPS
  - Agora: Atualiza código antes de buildar
  - Fix crítico para garantir que deploys contenham código atualizado

### Corrigido
- **CORS Issues**: Resolvidos problemas de CORS ao usar assets em Canvas/WebCodecs
  - Implementado proxy `/api/assets` com headers corretos
  - Exportação de vídeo agora funciona sem erros de CORS
  - Assets carregam corretamente em todos os navegadores

## [2.0.0] - 2024-12

### Adicionado
- Sistema de Shows (séries de vídeos)
- Integração com Veo API para geração de vídeos
- Suporte a múltiplos personagens por projeto
- Sistema de planos e limites de uso
- Exportação de projetos completos (ZIP)

### Modificado
- Migração de armazenamento local para R2 Storage
- Refatoração do schema do Prisma para suportar Shows
- Melhorias no sistema de autenticação

## [1.0.0] - 2024-11

### Adicionado
- Sistema de projetos e cenas
- Geração de roteiros com Gemini 2.5 Flash
- Geração de imagens com Imagen 3
- Geração de áudio com ElevenLabs
- Sistema de workflow com SSE
- Autenticação com NextAuth.js (Google OAuth)
- Sistema de bloqueio de projetos (concorrência)
- Soft delete para cenas e projetos
- Sistema de rastreamento de uso

---

**Legenda**:
- `Adicionado`: Novas funcionalidades
- `Modificado`: Mudanças em funcionalidades existentes
- `Corrigido`: Correções de bugs
- `Removido`: Funcionalidades removidas
- `Segurança`: Correções de vulnerabilidades
