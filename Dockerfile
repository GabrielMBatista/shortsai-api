# Base image
FROM node:22-slim AS base

# Install dependencies only when needed
FROM base AS deps
RUN apt-get update -y && apt-get install -y openssl ca-certificates
WORKDIR /app
COPY package.json package-lock.json* ./
COPY prisma ./prisma
RUN npm install

# Rebuild the source code only when needed
FROM base AS builder
RUN apt-get update -y && apt-get install -y openssl ca-certificates
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate Prisma Client
RUN npx prisma generate

# Build the Next.js application
ENV NEXT_BUILD=true
RUN npm run build

# Production image, copy all the files and run next
FROM base AS runner
RUN apt-get update -y && apt-get install -y openssl ca-certificates
WORKDIR /app

ENV NODE_ENV=production
# Uncomment the following line in case you want to disable telemetry during runtime.
ENV NEXT_TELEMETRY_DISABLED=1

RUN groupadd --system --gid 1001 nodejs
RUN useradd --system --uid 1001 nextjs

COPY --from=builder /app/public ./public

# Set the correct permission for prerender cache
RUN mkdir .next
RUN chown nextjs:nodejs .next

# Automatically leverage output traces to reduce image size
# https://nextjs.org/docs/advanced-features/output-file-tracing
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Install Prisma CLI globally for migrations
RUN npm install -g prisma@5.22.0

USER nextjs

EXPOSE 3333

ENV PORT=3333
# set hostname to localhost
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]

# ======================================
# Worker stage for Schedule Worker
# ======================================
FROM base AS worker
RUN apt-get update -y && apt-get install -y openssl ca-certificates
WORKDIR /app

ENV NODE_ENV=production

# Copy node_modules from deps (includes all dependencies)
COPY --from=deps /app/node_modules ./node_modules

# Copy prisma schema and generated client
COPY --from=builder /app/prisma ./prisma

# Copy all source files (TypeScript) that workers need
COPY --from=builder /app/lib ./lib
COPY --from=builder /app/app ./app

# Install tsx globally for TypeScript execution
RUN npm install -g tsx@latest

# Install Prisma CLI for schema access
RUN npm install -g prisma@5.22.0

EXPOSE 3333

# Default command (can be overridden in docker-compose)
CMD ["tsx", "lib/workers/unified-worker.ts"]
