# ArtixPOS — Business OS

A full-stack Point of Sale (POS) and business management platform built with React, Express, and PostgreSQL.

## Project Overview

ArtixPOS is a comprehensive business management system offering:
- Point of Sale with offline support (PWA/Service Worker)
- Real-time analytics & reports
- Built-in AI business assistant (multi-provider: Groq, Cerebras, Mistral)
- Multi-branch & team management
- Inventory, supplier & purchase order management
- Customer & membership management
- Appointments & staff scheduling
- Payroll management
- Expense tracking
- WiFi voucher management

## Architecture

- **Frontend**: React 18 + Vite, Tailwind CSS, Radix UI, TanStack Query, Wouter routing
- **Backend**: Express 5 + Node.js (TypeScript via tsx)
- **Database**: PostgreSQL via Drizzle ORM (primary), SQLite fallback
- **Auth**: Custom JWT-based auth (cookie + Bearer token), Passport.js with Google/Facebook OAuth strategies
- **Mobile**: Capacitor for Android/iOS wrapping
- **Cache/Rate Limiting**: Upstash Redis (optional, falls back to in-memory)

## Development

The app runs as a single server that serves both API routes and the Vite dev server (HMR).

```bash
# Start development server
npm run dev

# Push schema changes to DB
npm run db:push

# Build for production
npm run build
```

Server listens on port **5000** (webview).

## Workflow

- **Start application**: `NODE_ENV=development node_modules/.bin/tsx server/index.ts` on port 5000

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `SESSION_SECRET` | Yes | JWT signing secret (64+ char random string) |
| `GOOGLE_CLIENT_ID` | No | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | No | Google OAuth secret |
| `FACEBOOK_APP_ID` | No | Facebook OAuth app ID |
| `FACEBOOK_APP_SECRET` | No | Facebook OAuth secret |
| `GROQ_API_KEY` | No | Groq AI API key (AI assistant) |
| `CEREBRAS_API_KEY` | No | Cerebras AI API key (AI assistant fallback) |
| `MISTRAL_API_KEY` | No | Mistral AI API key (AI assistant fallback) |
| `UPSTASH_REDIS_REST_URL` | No | Upstash Redis URL (rate limiting) |
| `UPSTASH_REDIS_REST_TOKEN` | No | Upstash Redis token |
| `SMTP_HOST` | No | SMTP server for password reset emails |
| `SMTP_USER` | No | SMTP username |
| `SMTP_PASS` | No | SMTP password |
| `APP_URL` | No | Public app URL for OAuth callbacks |

## Key Files

- `server/index.ts` — Express app setup, middleware, server startup
- `server/auth.ts` — JWT auth, Passport strategies, auth routes
- `server/routes.ts` — API route registration
- `server/db.ts` — PostgreSQL pool + Drizzle ORM instance
- `server/ai-router.ts` — Multi-provider AI routing with circuit breakers
- `shared/schema.ts` — Drizzle ORM schema (shared between client and server)
- `client/src/App.tsx` — React app root, routing
- `client/src/hooks/use-auth.ts` — Auth state management
- `vite.config.ts` — Vite configuration

## Deployment

Build command: `npm run build`  
Run command: `node ./dist/index.cjs`
