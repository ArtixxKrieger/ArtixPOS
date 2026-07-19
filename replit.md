# ArtixPOS — Business OS

> **IMPORTANT — READ FIRST:**
> Replit is used **only for development, coding, and editing files**.
> **Deployment is handled entirely by Vercel.**
> The production domain is **artixpos.com**.
> Never suggest Replit deployment, Replit hosting, or `suggest_deploy` for this project.
> All build/deploy concerns are Vercel-specific (`npm run vercel-build`, `vercel.json`, environment variables set in the Vercel dashboard).

A full-stack Point of Sale (POS) and business management platform built with React, Express, and PostgreSQL.

## Project Overview

ArtixPOS is a comprehensive business management system offering:
- Point of Sale with offline support (PWA/Service Worker)
- Real-time analytics & reports
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

## Replit Setup (first time)

When importing this project into a new Replit workspace, run these steps once:

```bash
# 1. Install dependencies
npm install

# 2. Apply the base schema to the Replit-provisioned PostgreSQL (required on a fresh DB)
psql "$DATABASE_URL" -f migrations/0000_salty_shape.sql

# 3. Apply supplementary column/table migrations (idempotent)
npm run db:migrate

# 4. Start the dev server (or use the "Start application" workflow button)
npm run dev
```

> **Note:** `npm run db:push` (drizzle-kit) only syncs schema drift on an *existing* database.
> On a brand-new Replit workspace the database is empty, so you must run steps 2–3 first.
> The `scripts/post-merge.sh` post-merge hook does this automatically after task-agent merges.

Required secrets in Replit Secrets:
- `SESSION_SECRET` — JWT signing secret (already set)
- `DATABASE_URL` — managed automatically by Replit's built-in PostgreSQL; do not set manually

The app will be available at the Replit webview on port 5000.

> **Database note:** Replit provides a built-in PostgreSQL instance for development. If you prefer to use your own Supabase database, enable the Supabase connector from **Workspace Settings → Connectors**, then reconnect so `DATABASE_URL` is replaced with your Supabase connection string.

---

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

- **Start application**: `NODE_ENV=development npx tsx server/index.ts` on port 5000

The server opens port 5000 immediately, then finishes initializing (Vite dev server, RLS setup, etc.) in the background. The first page load may be slow while Vite warms up.

## Environment Variables (Replit)

The following secrets are stored in Replit Secrets:

| Secret | Description |
|---|---|
| `SESSION_SECRET` | JWT signing secret |

`DATABASE_URL` is managed automatically by Replit (built-in PostgreSQL) — do not set it manually.

### Full variable reference

### Auth (optional)
| Variable | Description |
|---|---|
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth secret |
| `FACEBOOK_APP_ID` | Facebook OAuth app ID |
| `FACEBOOK_APP_SECRET` | Facebook OAuth secret |

### Payments (optional — required to accept PayMongo payments)
| Variable | Description |
|---|---|
| `PAYMONGO_SECRET_KEY` | PayMongo secret key (sk_live_… or sk_test_…) |
| `PAYMONGO_WEBHOOK_SECRET` | Webhook signing secret from PayMongo dashboard (whsk_…). Set this after creating the webhook at `POST /api/webhooks/paymongo`. Without it, signature verification is skipped in development but **rejected in production**. |

### Cache & Rate Limiting (optional — falls back to in-memory)
| Variable | Description |
|---|---|
| `UPSTASH_REDIS_REST_URL` | Upstash Redis URL |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis token |

### Email (optional)
| Variable | Description |
|---|---|
| `SMTP_HOST` | SMTP server for password reset emails |
| `SMTP_USER` | SMTP username |
| `SMTP_PASS` | SMTP password |
| `APP_URL` | Public app URL for OAuth callbacks |

### Performance & Scalability tuning (optional — all have safe defaults)
| Variable | Default | Description |
|---|---|---|
| `DB_POOL_MAX` | `10` | Max PostgreSQL connections per process |
| `DB_STATEMENT_TIMEOUT_MS` | `15000` | Kill any query running longer than N ms |
| `DB_LOCK_TIMEOUT_MS` | `5000` | Fail fast if lock not acquired within N ms |
| `DB_READ_POOL_MAX` | `10` | Max connections for read replica pool |
| `DATABASE_READ_URL` | — | Read replica URL (offloads SELECT queries) |
| `CLUSTER_WORKERS` | CPU count | Worker processes in production cluster mode |
| `REQUEST_TIMEOUT_MS` | `30000` | Per-request timeout before 503 is returned |
| `SERVER_TIMEOUT_MS` | `120000` | Hard server socket timeout |

### Observability (optional)
| Variable | Description |
|---|---|
| `SENTRY_DSN` | Sentry DSN for error tracking |
| `METRICS_TOKEN` | Bearer token to protect `/api/metrics` endpoint |

## Key Files

- `server/index.ts` — Express app setup, all middleware, server startup
- `server/cluster.ts` — Production cluster entry point (multi-core, auto-restart)
- `server/auth.ts` — JWT auth, Passport strategies, auth routes
- `server/routes.ts` — API route registration
- `server/db.ts` — PostgreSQL pool + statement/lock timeouts + Drizzle ORM
- `server/db-read.ts` — Read replica connection (falls back to primary)
- `server/cache.ts` — Two-tier cache: L1 in-memory + L2 Redis
- `server/metrics.ts` — Request counts, latency percentiles, cache hit rate
- `server/indexes.ts` — 45+ DB indexes applied on startup
- `shared/schema.ts` — Drizzle ORM schema (shared between client and server)
- `client/src/App.tsx` — React app root, routing
- `vite.config.ts` — Vite configuration

## Deployment

Build command: `npm run build`

**Single-process** (development / simple deploy):
```
node ./dist/index.cjs
```

**Multi-core cluster** (production — uses all CPU cores):
```
node ./dist/cluster.cjs
```

The cluster mode forks one worker per CPU core and auto-restarts any worker that crashes. Set `CLUSTER_WORKERS=1` to disable clustering.
