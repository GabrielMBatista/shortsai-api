#!/bin/bash

# ==============================================================================
# Script de Deploy do Worker (ShortsAI) para Google Cloud Run
# ==============================================================================

# Configurações do Projeto
PROJECT_ID="idyllic-chimera-366121" # <-- ID DO SEU PROJETO
REGION="us-central1"
APP_NAME="shortsai-worker"
IMAGE_NAME="gcr.io/$PROJECT_ID/$APP_NAME"

# Cores
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== Iniciando Deploy do ShortsAI Worker ===${NC}"

# 1. Verificar dependências
if ! command -v gcloud &> /dev/null; then
    echo -e "${RED}Erro: gcloud CLI não encontrado.${NC}"
    echo "Por favor instale: https://cloud.google.com/sdk/docs/install"
    exit 1
fi

if ! command -v docker &> /dev/null; then
    echo -e "${RED}Erro: Docker não encontrado.${NC}"
    exit 1
fi

# 2. Login e Configuração (Opcional, se já não estiver feito)
echo "Verificando autenticação..."
# gcloud auth login
# gcloud config set project $PROJECT_ID

# 3. Build da Imagem
echo -e "${GREEN}>> Construindo imagem Docker...${NC}"
docker build -t $IMAGE_NAME -f worker/Dockerfile worker/

# 4. Push para o Container Registry
echo -e "${GREEN}>> Configurando Docker para GCR...${NC}"
gcloud auth configure-docker gcr.io --quiet

echo -e "${GREEN}>> Enviando imagem para o Google Container Registry...${NC}"
docker push $IMAGE_NAME

# 5. Deploy no Cloud Run
echo -e "${GREEN}>> Realizando Deploy no Cloud Run...${NC}"

# Lendo variáveis do .env para injetar (Apenas as necessárias)
# Nota: É mais seguro definir secrets via Secret Manager, mas para MVP vamos direto.
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
fi

gcloud run deploy $APP_NAME \
    --image $IMAGE_NAME \
    --platform managed \
    --region $REGION \
    --allow-unauthenticated \
    --memory 2Gi \
    --cpu 2 \
    --timeout 3600 \
    --port 8080 \
    --set-env-vars R2_ACCOUNT_ID="$R2_ACCOUNT_ID",R2_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID",R2_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY",R2_BUCKET_NAME="$R2_BUCKET_NAME",NEXT_PUBLIC_STORAGE_URL="$NEXT_PUBLIC_STORAGE_URL",R2_ENDPOINT="$R2_ENDPOINT"

echo -e "${GREEN}=== Deploy Concluído! ===${NC}"
echo "Copie a URL acima e atualize seu .env (VPS) com CLOUD_RUN_URL."
