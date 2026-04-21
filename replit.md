# ArtixPOS System

## Overview
A full-stack Point of Sale (POS) system for café management with React/TypeScript frontend, Express backend, and PostgreSQL via Drizzle ORM.

## Features
- **Product Management**: Create/edit products with sizes and modifiers
- **POS Interface**: Fast, intuitive ordering with product customization
- **Pending Orders**: Save and manage unpaid/parked transactions
- **Analytics**: Real-time sales tracking with charts, filtered by date
- **Dashboard**: Daily revenue, tax, and transaction overview
- **PWA Support**: Installable as a standalone app on mobile and desktop
- **Multi-Tenant RBAC**: Each business = 1 tenant, multiple branches, full data isolation
- **Roles**: Owner (full access), Admin (branch-scoped), Cashier (POS only)
- **Admin Panel**: Branch management, user management, cross-branch analytics, audit logs
- **Staff Auth**: Email/password login for admin-created staff accounts
- **Audit Logging**: Full history of all admin actions (owner-only)
- **AI Memory Layer**: SimpleMem-style atomic fact extraction per conversation. Memories stored in `ai_memories` table, injected into system prompt. Persists across sessions even if chat is deleted. Tenant-isolated + business-type tagged. Consolidation: decay stale facts, cap at 120 per tenant.

## Architecture
- **Frontend**: React + TypeScript + TailwindCSS
- **Backend**: Express.js with SQLite (Drizzle ORM)
- **State Management**: TanStack React Query
- **Styling**: Shadcn UI components + Liquid Glass design system (real `backdrop-filter` blur, specular highlights, vivid multi-color gradient backgrounds)
- **Mobile**: Capacitor (Android & iOS native app builds via GitHub Actions)
- **Auth**: JWT in httpOnly cookies (1-day TTL); OAuth (Google, Facebook) + local email/password for staff
- **RBAC Middleware**: `requireAuth`, `requireOwner`, `requireAdminOrAbove`, `requireTenant` in `server/middleware.ts`
- **Multi-tenant DB**: `tenants`, `branches`, `user_branches`, `audit_logs` tables; all existing tables have nullable `branchId`
- **Crypto**: `server/crypto.ts` — unified password hashing (scrypt, `hash.salt` format) with backward-compat for legacy `salt:hash` format

## Key Files (Admin Panel)
- `server/middleware.ts` — RBAC middleware (requireAuth, requireOwner, requireAdminOrAbove, requireTenant)
- `server/admin-storage.ts` — Admin CRUD: tenants, branches, users, user-branch assignments, analytics, audit logs
- `server/admin-routes.ts` — All admin API endpoints under `/api/admin/*`
- `client/src/hooks/use-admin.ts` — Frontend hooks for all admin operations
- `client/src/pages/admin/` — Admin pages: index, branches, users, analytics, audit-logs

## Admin API Routes
- `POST /api/auth/local-login` — Email/password login for staff
- `POST /api/admin/ensure-tenant` — Creates tenant for first-time OAuth login
- `GET/POST/PUT/DELETE /api/admin/branches` — Branch CRUD (owner/admin)
- `GET/POST/PUT/DELETE /api/admin/users` — User CRUD (owner/admin)
- `POST /api/admin/users/:id/branches` — Assign branch to user (owner)
- `POST /api/admin/switch-branch` — Switch active branch
- `GET /api/admin/analytics` — Cross-branch analytics
- `GET /api/admin/audit-logs` — Audit log (owner only)

## Design System
- **Theme Colors**: Violet-600 primary (hsl 262 83% 58% light / hsl 265 75% 68% dark)
- **Font**: Plus Jakarta Sans (primary) + Inter (fallback), loaded from Google Fonts
- **Border Radius**: 2xl (1rem), xl (0.75rem), lg (0.625rem) — clean modern radius
- **Glass utilities**: `.glass-card`, `.glass-sidebar`, `.glass-nav`, `.glass-header`, `.glass-cart-bar` — NO backdrop-filter blur for mobile GPU performance
- **Gradients**: Ambient background glows (dark mode), card gradient tints (violet, emerald, amber, rose)
- **Animations**: page-enter (slide-up), animate-fade-scale, card-press, skeleton-shimmer, stagger-children
- **Dark Mode**: Full light/dark mode with CSS variables; toggle stored in localStorage
- **Login Page**: Desktop split-panel layout (left: violet brand panel, right: form); mobile centered card
- **Sidebar**: 220px wide, grouped nav sections (Main/Operations/Management/Finance/Tools/Admin), `.nav-item-active` gradient class
- **Nav active state**: `.nav-item-active` class — violet gradient bg + border

## Currency & Settings
- Store name: "ArtixPOS"
- Currency symbol: ₱ (Philippine Peso)
- Tax rate: Configurable in settings
- Payment methods: Cash, Online

## Mobile App (Capacitor)

### Setup
The app uses [Capacitor](https://capacitorjs.com/) to wrap the React frontend as a native Android and iOS app.

- **App ID**: `com.cafebara.app`
- **Web build output**: `dist/public` (Vite build)
- **Config file**: `capacitor.config.ts`

### Building Locally
Before running Capacitor commands, build the web assets first:
```bash
npx vite build
npx cap add android   # first time only
npx cap add ios       # first time only (macOS required)
npx cap sync          # sync web assets to native projects
```

### GitHub Actions CI
Two workflows are set up in `.github/workflows/`:

| Workflow | Runner | Output |
|---|---|---|
| `build-android.yml` | `ubuntu-latest` | `app-debug.apk` |
| `build-ios.yml` | `macos-latest` | Simulator `.app` build |

Both workflows trigger automatically on push to `main`/`master` and can also be triggered manually. The built APK/app is uploaded as a GitHub Actions artifact (kept 30 days).

> **Note**: Signing for release builds requires adding your keystore/certificate as GitHub Actions secrets and updating the workflow accordingly.

## File Structure
```
├── client/
│   ├── index.html          # PWA entry point with manifest & SW registration
│   ├── public/
│   │   ├── manifest.json   # PWA manifest
│   │   ├── sw.js           # Service worker for offline support
│   │   └── logo*.png       # App icons
│   └── src/
│       ├── pages/          # Dashboard, POS, Analytics, Products, Pending Orders
│       └── components/     # Shadcn UI + custom components
├── server/
│   ├── index.ts            # Express app & Vite integration
│   ├── storage.ts          # Database interface (SQLite)
│   └── routes.ts           # API endpoints
├── shared/
│   └── schema.ts           # Drizzle ORM schema & Zod validation
├── vite.config.ts          # Vite build config
├── capacitor.config.ts     # Capacitor mobile app config
└── .github/
    └── workflows/
        ├── build-android.yml   # Android APK build (ubuntu-latest)
        └── build-ios.yml       # iOS build (macos-latest)
```

## How to Install as an App

### Desktop (Chrome, Edge, Brave)
1. Open the app in your browser
2. Look for the **Install** button in the address bar (or use the three dots menu)
3. Click "Install ArtixPOS"
4. The app will appear on your desktop and taskbar

### Mobile (Android)
1. Open the app in Chrome or Brave browser
2. Tap the three dots menu (top right)
3. Select "Install app" or "Add to home screen"
4. Confirm installation
5. App will be pinned to your home screen

### iOS (iPad/iPhone)
1. Open the app in Safari
2. Tap the **Share** button (bottom center)
3. Scroll down and tap "Add to Home Screen"
4. Choose a name and tap "Add"
5. The app will appear on your home screen

## AI Assistant

- **Floating chat button** (sparkle icon) appears on all pages after login
- **Powered by Groq + Llama 3.3 70B** — completely free, no usage limits
- **Database-aware**: reads real-time sales, products, customers, expenses, shifts to answer questions
- **File import**: upload PDF, Excel (.xlsx/.xls), or CSV files — AI parses and can bulk-import products
- **API Routes**:
  - `POST /api/ai/chat` — send messages with optional file content
  - `POST /api/ai/upload` — parse uploaded file (returns text content)
  - `POST /api/ai/import-products` — bulk create products from AI-extracted data
- **Config**: requires `GROQ_API_KEY` secret in Replit Secrets

## Key Features
- **Offline Support**: Service worker caches critical pages and API responses
- **Fast & Responsive**: Loads instantly, even on slow networks
- **No App Store Required**: Install directly from the web
- **Auto-Updates**: App checks for updates on each launch
- **Full-Screen Mode**: Runs like a native app without browser UI

## PWA Files
- `manifest.json`: App metadata, icons, shortcuts
- `sw.js`: Service worker for caching and offline functionality
- Meta tags in `index.html`: iOS support, theme colors, app capabilities

## Analytics & Reporting
- **Real-time Charts**: Revenue trends (last 30 days), top products, payment methods
- **Big Data Optimization**: Efficient data processing for large datasets
- **Dark Mode Support**: All charts readable in dark mode
- **Date Filtering**: View metrics for any specific day

## Data Persistence
- SQLite database persists locally
- Service worker caches app shell and API responses
- Works offline, syncs when connection resumes

## Replit Environment

Production is intended to run on Vercel. Replit is used for development/preview only, so production URL and OAuth callback behavior should continue to prefer Vercel configuration (`APP_URL` / `VERCEL_URL`) rather than Replit preview domains.

### Running the App
- **Dev server**: `npm run dev` (starts on port 5000)
- **Database**: PostgreSQL via `DATABASE_URL`
- **db:push**: `npm run db:push` syncs the Drizzle schema to the configured PostgreSQL database

### Optional Environment Variables
- `SUPABASE_POOLER_URL` / `SUPABASE_DATABASE_URL`: Optional PostgreSQL fallback connection strings
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`: Enable Google OAuth login
- `FACEBOOK_APP_ID` / `FACEBOOK_APP_SECRET`: Enable Facebook OAuth login
- `SESSION_SECRET`: Custom session secret (auto-generated if not set)
- `APP_URL`: Production public URL; development prefers the Replit preview domain automatically

## Notes
- No external authentication required (local login)
- Tax calculation applied automatically at checkout
- Order history preserved in database
- Charts optimized to show last 30 days of revenue data
- Tooltips have adaptive colors for dark/light modes
- Free plan includes 1 branch, 50 products, 2 staff accounts, and a separate simple analytics screen; Pro keeps the advanced analytics dashboard with exports/custom ranges plus multi-branch, AI, customers, expenses, and automation modules
- Pro voucher codes can be enabled with `PRO_VOUCHER_CODE` or comma-separated `PRO_VOUCHER_CODES` values; each code may include an optional day duration like `CODE:30`
- Feature gating is business-type aware: Free includes core modules required by the selected business (for example Tables for Bar/Pub, Kitchen/Tables for Restaurant, Appointments/Staff for Services, Rooms where rooms/studios/chairs are core, Memberships for Gym, and Customers/Records for clinic/dental). Pro still unlocks all modules across all business types and branches.
