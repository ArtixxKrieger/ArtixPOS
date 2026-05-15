<div align="center">

<img src="client/public/logo192.png" width="80" alt="ArtixPOS Logo" />

# ArtixPOS — Business OS

**The all-in-one Point of Sale & Business Management platform.**  
Sales · Inventory · Staff · Analytics · AI — fully in your control.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react&logoColor=black)](https://reactjs.org/)
[![Express](https://img.shields.io/badge/Express-5-000000?style=flat-square&logo=express&logoColor=white)](https://expressjs.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Drizzle_ORM-336791?style=flat-square&logo=postgresql&logoColor=white)](https://orm.drizzle.team/)
[![PWA](https://img.shields.io/badge/PWA-Offline_Ready-5A0FC8?style=flat-square&logo=pwa&logoColor=white)](https://web.dev/progressive-web-apps/)
[![License](https://img.shields.io/badge/License-Unlicensed-red?style=flat-square)](./LICENSE)

<br />

![ArtixPOS Login Screen](screenshots/login.jpg)

</div>

---

## What is ArtixPOS?

ArtixPOS is a full-stack, multi-tenant **Business Operating System** built for modern Philippine retailers, restaurants, salons, clinics, and service businesses. It replaces a handful of disconnected tools with a single, fast, and offline-capable platform — from ringing up a sale to filing your BIR Z-Report.

> Built with speed in mind. Works without internet. Scales from a single register to a multi-branch enterprise.

---

## Features

### 🛒 Point of Sale
- Touch-optimized POS interface with barcode scanning
- Product variants, modifiers, and add-ons
- Cash, card, GCash, Maya payment types
- Offline sale processing with automatic sync on reconnect
- Pending orders queue (dine-in, takeout, delivery)
- Receipt printing & re-printing, WiFi voucher generation

### 📦 Inventory & Products
- Full product catalog with categories, SKUs, and barcodes
- Real-time stock tracking with low-stock alerts
- Expiry date & batch number tracking (pharmacy/grocery)
- Supplier management and Purchase Order workflow

### 📊 Analytics & Reports
- Live revenue dashboard with charts (Recharts)
- Top-selling products, category breakdowns, hourly heatmaps
- Shift reports, cash drawer reconciliation
- Expense tracking for true net profit visibility

### 🇵🇭 BIR Compliance (Philippines)
- X-Reports (shift reading) and Z-Reports (end-of-day)
- Electronic Journal (e-Journal) download
- VATable / VAT-exempt / zero-rated sales breakdown
- BIR Form 2550M VAT worksheet
- OR Number atomic sequencing
- SC / PWD senior citizen and PWD discount support
- SHA-256 tamper-evident audit log for voided transactions

### 👥 Customer & Loyalty
- Customer profiles with purchase history
- Multi-tiered loyalty points — birthday bonuses, referral bonuses, multipliers
- Digital stamp cards (e.g., Buy 10 Get 1 Free)
- Membership plans and subscriptions
- Discount code engine with usage limits & expiry

### 🏢 Staff & Operations
- Staff profiles, roles, and permission controls
- Shift management with open/close cash drawer
- Time clock — staff clock-in / clock-out
- Payroll computation (hourly, monthly salary, commission-based)
- Appointments & calendar booking (salons, clinics, gyms)
- Service staff assignment and tracking

### 🍽️ Industry-Specific Modules
| Module | For |
|---|---|
| Kitchen Display System | Restaurants & cafes |
| Table & floor layout | Dine-in restaurants & bars |
| Appointment calendar | Salons, clinics, spas |
| Room management | Hotels & guesthouses |
| Pharmacy/expiry tracking | Drugstores & groceries |

### 🤖 AI Business Assistant
- Multi-provider AI router: **Groq → Cerebras → Mistral** (automatic failover)
- Locally runs **Ollama (Llama 3.2)** when offline
- Circuit breakers prevent cascading failures
- Accessible from a floating button on every page

### 🌐 Multi-Branch & Admin
- Manage multiple store branches from one account
- Per-branch inventory, staff, and analytics
- Global admin panel: user management, audit logs, permissions
- Dynamic UI that adapts labels and modules to your business type

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | React 18, Vite, TypeScript, Tailwind CSS v3, Radix UI, Framer Motion |
| **Routing** | Wouter |
| **Data Fetching** | TanStack Query v5 |
| **Backend** | Express 5, Node.js, TypeScript (tsx) |
| **Database** | PostgreSQL via Drizzle ORM |
| **Auth** | Custom JWT (cookie + Bearer), Passport.js, Google OAuth |
| **Offline** | Service Worker (PWA), IndexedDB (idb), mutation sync queue |
| **Caching** | Two-tier: in-memory L1 + Upstash Redis L2 (optional) |
| **Rate Limiting** | express-rate-limit + Upstash Ratelimit (optional) |
| **AI** | Groq, Cerebras, Mistral, Ollama — with circuit breakers |
| **Mobile** | Capacitor (Android / iOS) |
| **Monitoring** | Sentry (optional), custom `/api/metrics` endpoint |
| **Deployment** | Replit (dev) · Vercel (serverless) · Node cluster (self-hosted) |

---

## Getting Started

### Prerequisites
- Node.js 18+
- PostgreSQL database (e.g., [Neon](https://neon.tech), [Supabase](https://supabase.com), or local)

### 1. Clone & install

```bash
git clone https://github.com/your-username/artixpos.git
cd artixpos
npm install
```

### 2. Set environment variables

Copy the example file and fill in the required values:

```bash
cp .env.example .env
```

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `SESSION_SECRET` | ✅ | JWT signing secret (64+ char random string) |
| `GROQ_API_KEY` | Optional | AI assistant (Groq) |
| `GOOGLE_CLIENT_ID` | Optional | Google OAuth sign-in |
| `GOOGLE_CLIENT_SECRET` | Optional | Google OAuth sign-in |
| `UPSTASH_REDIS_REST_URL` | Optional | Redis cache & rate limiting |
| `UPSTASH_REDIS_REST_TOKEN` | Optional | Redis cache & rate limiting |
| `SMTP_HOST` | Optional | Password reset emails |
| `SENTRY_DSN` | Optional | Production error tracking |

Generate a `SESSION_SECRET`:
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### 3. Push the database schema

```bash
npm run db:push
```

### 4. Start the development server

```bash
npm run dev
```

Open [http://localhost:5000](http://localhost:5000) — the app is served on a single port.

---

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start dev server (Express + Vite HMR on port 5000) |
| `npm run build` | Build frontend + bundle server for production |
| `npm start` | Run production build (single process) |
| `npm run db:push` | Sync Drizzle schema to the database |
| `npm run check` | TypeScript type check |

---

## Deployment

### Replit
The project is pre-configured for Replit. Just set your environment secrets and hit Run.

### Vercel
```bash
npm run build
```
`vercel.json` is included and routes all API traffic through `api/index.js`.

### Self-hosted (multi-core)
```bash
npm run build
node ./dist/cluster.cjs   # Forks one worker per CPU core, auto-restarts on crash
```

---

## Project Structure

```
artixpos/
├── client/          # React frontend (Vite)
│   └── src/
│       ├── pages/   # Route-level page components
│       ├── components/ui/  # Shadcn/Radix UI components
│       ├── hooks/   # Custom React hooks
│       └── lib/     # Offline DB, sync, printing utilities
├── server/          # Express backend
│   ├── routes/      # API endpoints by domain
│   ├── auth.ts      # JWT + Passport strategies
│   ├── db.ts        # Drizzle ORM + connection pool
│   ├── cache.ts     # Two-tier cache
│   └── ai-router.ts # Multi-provider AI with circuit breakers
├── shared/          # Types & schema shared by client + server
│   └── schema.ts    # Drizzle table definitions (source of truth)
├── migrations/      # SQL migration files
└── script/          # Build & utility scripts
```

---

## Offline Support

ArtixPOS is a **Progressive Web App**. When the internet goes down:
- The service worker serves the app shell from cache
- Sales are written to **IndexedDB** locally
- A mutation queue automatically syncs pending operations when connectivity returns
- The AI assistant switches to a local **Ollama** instance if available

---

## License

This project is **unlicensed** — all rights reserved.

---

<div align="center">

Built with care for Filipino businesses. 🇵🇭

</div>
