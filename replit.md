# ArtixPOS System

## Overview
ArtixPOS is a full-stack Point of Sale (POS) system designed for café management, with capabilities extending to other business types like salons, retail, and restaurants. It aims to provide a robust, intuitive, and scalable solution for managing products, sales, orders, and staff, offering real-time analytics and multi-tenant support. The system is envisioned to be a comprehensive tool for small to medium-sized businesses, enabling efficient operations, data-driven decision-making, and seamless customer interactions. Key capabilities include a fast POS interface, product customization, pending order management, detailed analytics, and PWA support for multi-platform accessibility.

## User Preferences
I prefer simple language and clear explanations. I want iterative development with frequent, small updates. Ask before making major architectural changes or introducing new external dependencies. For AI features, ensure responses are always relevant to store operations and prevent the AI from engaging in off-topic discussions. When the AI performs an action like adding a product or logging an expense, provide an "Undo" option for a short period. Ensure that all data is isolated per tenant and branch. Do not make changes to folder `node_modules` and the file `package-lock.json`.

## System Architecture
The ArtixPOS system is built with a React + TypeScript + TailwindCSS frontend and an Express.js backend utilizing SQLite (Drizzle ORM) for data persistence. TanStack React Query manages state on the frontend. The UI/UX is characterized by a modern design system using Shadcn UI components, a Violet-600 primary color, "Plus Jakarta Sans" font, and generous border radii for a clean aesthetic. Glassmorphism-inspired utility classes are used for certain elements, carefully avoiding `backdrop-filter` for mobile performance. Full light/dark mode support is included, managed via CSS variables and local storage.

Core technical implementations include:
- **Authentication**: JWTs in httpOnly cookies for sessions, supporting both local email/password login for staff and OAuth (Google, Facebook).
- **Authorization**: Role-Based Access Control (RBAC) middleware (`requireAuth`, `requireOwner`, `requireAdminOrAbove`, `requireTenant`) enforces permissions across different user roles (Owner, Admin, Cashier).
- **Multi-tenancy**: The database schema includes `tenants`, `branches`, `user_branches`, and `audit_logs` tables, with all other data tables linking back to `branchId` or `tenantId` to ensure full data isolation.
- **AI Integration**: An AI Assistant, powered by Groq and Llama 3.3 70B, is deeply integrated. It uses a SimpleMem-style atomic fact extraction for memory, stored in `ai_memories` and injected into system prompts. The AI is database-aware, capable of answering questions based on real-time sales, products, and expenses. It supports file uploads (PDF, Excel, CSV) for parsing and bulk imports. Critical AI design patterns include:
    - **Action Tags**: AI emits `[TAG]{json}[/TAG]` markers to trigger specific actions (e.g., product CRUD, expense logging, discount management), which are parsed and rendered as confirmation cards in the UI.
    - **Reorder for Regulars**: AI can recall a customer's recent orders and provide a quick reorder option.
    - **Off-Topic Filter**: Pre-LLM regex filters block irrelevant queries to conserve tokens and maintain focus.
    - **Action-Capability Shortcut**: A pre-LLM regex provides quick answers to capability questions, reducing LLM load.
    - **Undo Chip**: A temporary "Undo" option appears after certain AI actions.
    - **Error Resilience**: AI errors are handled gracefully with "Try again" options and collapsing identical error messages.
- **PWA Support**: The application is installable as a Progressive Web App, offering offline capabilities through a service worker, auto-updates, and full-screen mode.
- **Mobile App**: Capacitor is used to wrap the React frontend into native Android and iOS applications, with CI/CD pipelines via GitHub Actions for automated builds.
- **Branch-Specific Configuration**: Each branch can have its own `businessType` and `businessSubType`, dynamically adapting navigation, quick actions, and the dashboard. New branches can be seeded with starter catalogs based on their business type.
- **Resilience**: Service worker caching strategies are optimized for assets and lazy-loaded chunks. An `<ErrorBoundary>` handles lazy-import failures and provides offline-aware recovery mechanisms.

## External Dependencies
- **Database**: PostgreSQL via Replit's managed database (DATABASE_URL auto-configured)
- **ORM**: Drizzle ORM
- **AI Model**: Groq (Llama 3.3 70B) — requires GROQ_API_KEY secret
- **OAuth Providers**: Google (optional, requires GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET)
- **Mobile Wrapper**: Capacitor
- **Font Hosting**: Google Fonts

## Replit Environment Notes
- Runs on port 5000 (webview) in development via `npm run dev`
- Dev command uses `node node_modules/tsx/dist/cli.mjs` directly (tsx is installed locally; the `.bin/tsx` symlink points to the wrong binary)
- `SESSION_SECRET` and `DATABASE_URL` are provisioned as Replit secrets
- Deployment build: `npm run build`, run: `node ./dist/index.cjs`
- Optional AI keys: `GROQ_API_KEY`, `CEREBRAS_API_KEY`, `MISTRAL_API_KEY`
- Optional payment key: `PAYMONGO_SECRET_KEY` (for subscription billing)
- Optional email: `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS` (for password reset emails)

## Advanced Loyalty System (Added)
- **Database tables**: `loyalty_tiers`, `loyalty_rewards`, `loyalty_points_log`; new columns on `customers` (`lifetime_points`, `tier`, `birthday`, `stamp_count`, `referred_by`) and on `user_settings` (`loyalty_expiry_days`, `loyalty_birthday_bonus`, `loyalty_referral_bonus`, `loyalty_stamp_target`, `loyalty_stamp_enabled`)
- **Backend**: Full CRUD routes for `/api/loyalty/tiers`, `/api/loyalty/rewards`; enhanced `/api/customers/:id/loyalty` (manual adjust with reason+note), `/api/customers/:id/loyalty-log`, `/api/customers/:id/redeem-reward`; auto-tier recalculation on every points change
- **Customers page** (`/customers`): Tier badges, lifetime/current points, visit stats, purchase history, 3-tab profile dialog (Overview + manual adjust, Points Log, Redeem rewards), birthday field in add/edit form
- **Loyalty page** (`/loyalty`): 4-tab layout — Dashboard (stats, tier distribution bar chart, top members), Tiers (CRUD with color picker, multiplier, perks, Bronze/Silver/Gold/Platinum presets), Rewards Catalog (CRUD with type: fixed/percent/free product/stamp/custom, active toggle, max redemptions, expiry), Settings (point earn rate, redemption rate, birthday bonus, referral bonus, stamp card toggle, points expiry)