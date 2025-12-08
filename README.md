# ShortsAI API

The backend REST API for ShortsAI, built with Next.js 15 (App Router).

## 📚 Documentation

Detailed documentation is available in the **[Wiki](docs/WIKI.md)**.

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Setup Database
npx prisma generate
npx prisma db push

# Run Development Server
npm run dev
```

## 🏗 Architecture
- **Framework**: Next.js
- **Database**: PostgreSQL (Prisma)
- **Queue**: Redis (BullMQ)
