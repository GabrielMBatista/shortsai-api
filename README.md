# ShortsAI API 🚀

[![Tests](https://img.shields.io/badge/tests-19%20passing-success)](./wiki/02-testing.md)
[![Code Quality](https://img.shields.io/badge/quality-enterprise-blue)](./wiki/01-architecture.md)
[![TypeScript](https://img.shields.io/badge/typescript-5.0-blue)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/next.js-15.0-black)](https://nextjs.org/)

The central nervous system of the ShortsAI platform. A robust **Next.js 15 (App Router)** backend with **enterprise-grade architecture**, acting as the API Gateway and Orchestrator.

## 📚 **[Full Documentation Wiki](./wiki/README.md)**

Complete guides, architecture details, and development workflows:

- **[🏗 Architecture Overview](./wiki/01-architecture.md)** - System design and patterns
- **[🧪 Testing Guide](./wiki/02-testing.md)** - Jest tests and quality assurance
- **[📊 Logging & Monitoring](./wiki/03-logging.md)** - Structured logging with Pino
- **[⚠️ Error Handling](./wiki/04-error-handling.md)** - Custom errors and middleware
- **[✅ Validation](./wiki/05-validation.md)** - Zod schemas and type safety
- **[🚀 API Endpoints](./wiki/06-endpoints.md)** - Complete API reference (20 endpoints)
- **[📖 Quick Start](./wiki/07-quick-start.md)** - Get up and running in 5 minutes
- **[🛠 Development](./wiki/08-development.md)** - Contribution guidelines
- **[📈 Migration Guide](./wiki/09-migration-history.md)** - Junior → Senior code transformation

---

## 🏗 Architecture Highlights

**Modern Serverless Architecture** with enterprise-grade features:

- ✅ **20 Enterprise-Level Endpoints** - All with logging, validation, and error handling
- ✅ **19 Automated Tests** - Jest + TypeScript for quality assurance
- ✅ **Structured Logging** - Pino with request tracking and performance metrics
- ✅ **Type-Safe Validation** - Zod schemas for all inputs
- ✅ **Custom Error Handling** - 9 HTTP error classes with proper status codes
- ✅ **Request ID Tracking** - Full observability and debugging capabilities
- ✅ **Performance Metrics** - Automatic duration logging for all operations

### Tech Stack

- **Framework**: Next.js 15 (App Router)
- **Language**: TypeScript 5.0 (strict mode)
- **Database**: PostgreSQL + Prisma ORM
- **Testing**: Jest + ts-jest
- **Logging**: Pino (structured JSON logs)
- **Validation**: Zod
- **Storage**: Cloudflare R2
- **AI**: Gemini 2.5 Flash, ElevenLabs, Groq

---

## 🚀 Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Database Setup
```bash
npx prisma generate
npx prisma db push
```

### 3. Environment Variables
Copy `.env.example` to `.env` and fill in your credentials:
```env
DATABASE_URL="postgresql://..."
GEMINI_API_KEY="..."
ELEVENLABS_API_KEY="..."
```

### 4. Run Development Server
```bash
npm run dev
```

### 5. Run Tests
```bash
npm test
```

**👉 For detailed setup instructions, see [Quick Start Guide](./wiki/07-quick-start.md)**

---

## 📚 Core APIs

| Endpoint | Methods | Description |
|----------|---------|-------------|
| `/api/projects` | GET, POST, PATCH, DELETE | Project management with validation |
| `/api/channels` | GET, POST | YouTube channel integration |
| `/api/personas` | GET, POST, PATCH, DELETE | AI personality management |
| `/api/users` | GET, POST | User management with limits |

**👉 See complete [API Reference](./wiki/06-endpoints.md) for all 20 endpoints**

---

## 🧪 Testing

All infrastructure has comprehensive test coverage:

```bash
npm test              # Run all tests
npm run test:watch    # Watch mode
npm run test:coverage # Coverage report
```

**Current Status**: 19/19 tests passing ✅

**👉 Learn more in [Testing Guide](./wiki/02-testing.md)**

---

## 📊 Code Quality

This codebase follows **enterprise-grade best practices**:

- 🏆 **Clean Architecture** - Separation of concerns, DRY, SOLID
- 🔍 **Type Safety** - Zod + TypeScript for 100% type coverage
- 📝 **Documentation** - JSDoc on all endpoints, comprehensive Wiki
- 🧪 **Test Coverage** - 100% infrastructure coverage
- 📊 **Observability** - Request IDs, performance metrics, structured logs
- ⚡ **Performance** - Optimized queries, parallel operations
- 🔒 **Security** - Rate limiting, input validation, error sanitization

**👉 See [Migration History](./wiki/09-migration-history.md) for transformation details**

---

## 🤝 Contributing

We welcome contributions! Please follow our guidelines:

1. **Code Style**: Follow existing patterns (see [Development Guide](./wiki/08-development.md))
2. **Testing**: Add tests for new features
3. **Documentation**: Update Wiki for significant changes
4. **Validation**: Use Zod schemas for all inputs
5. **Logging**: Use structured logging (Pino)
6. **Errors**: Use custom error classes

**👉 Full details in [Development Guide](./wiki/08-development.md)**

---

## 📖 Learn More

- [Architecture Deep Dive](./wiki/01-architecture.md) - Design decisions and patterns
- [Error Handling Strategy](./wiki/04-error-handling.md) - How we manage errors
- [Validation Best Practices](./wiki/05-validation.md) - Type-safe inputs
- [Logging Standards](./wiki/03-logging.md) - Observability guide

---

## 📊 Project Status

- ✅ **Code Quality**: Enterprise-level
- ✅ **Test Coverage**: Infrastructure 100%
- ✅ **Documentation**: Complete Wiki
- ✅ **API Endpoints**: 20/20 migrated
- ✅ **Type Safety**: Fully typed
- ⚡ **Performance**: Optimized
- 🔒 **Security**: Best practices applied

---

## 📝 License

This project is part of the ShortsAI platform.

---

**Made with ❤️ by the ShortsAI team** | **[📚 Full Wiki Documentation](./wiki/README.md)**
