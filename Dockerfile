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

# Ensure public directory exists
RUN mkdir -p public

# Build the Next.js application
# Skip Redis connection attempts during build to reduce log noise
ENV NEXT_BUILD=true
ENV SKIP_REDIS_CONNECTION=true
RUN npm run build

# Production image, copy all the files and run next
FROM base AS runner
RUN apt-get update -y && apt-get install -y openssl ca-certificates ffmpeg
WORKDIR /app

ENV NODE_ENV=production
# Uncomment the following line in case you want to disable telemetry during runtime.
ENV NEXT_TELEMETRY_DISABLED=1

RUN groupadd --system --gid 1001 nodejs
RUN useradd --system --uid 1001 nextjs

# Copy public folder if it exists
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
