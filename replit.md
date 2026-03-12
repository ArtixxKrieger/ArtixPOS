# Café Bara POS System

## Overview
A full-stack Point of Sale (POS) system for café management with React/TypeScript frontend, Express backend, and SQLite via Drizzle ORM.

## Features
- **Product Management**: Create/edit products with sizes and modifiers
- **POS Interface**: Fast, intuitive ordering with product customization
- **Pending Orders**: Save and manage unpaid/parked transactions
- **Analytics**: Real-time sales tracking with charts, filtered by date
- **Dashboard**: Daily revenue, tax, and transaction overview
- **PWA Support**: Installable as a standalone app on mobile and desktop

## Architecture
- **Frontend**: React + TypeScript + TailwindCSS
- **Backend**: Express.js with SQLite (Drizzle ORM)
- **State Management**: TanStack React Query
- **Styling**: Shadcn UI components + custom design system

## Design System
- **Theme Colors**: Indigo-500 primary, Violet-600 secondary
- **Border Radius**: Rounded-3xl / rounded-[2.5rem] (glassmorphic)
- **Gradients**: Background gradients on cards (violet, pink, amber, emerald tints)
- **Animations**: Smooth fade-in, hover effects, animated counters
- **Dark Mode**: Full light/dark mode support with CSS variables

## Currency & Settings
- Store name: "Café Bara"
- Currency symbol: ₱ (Philippine Peso)
- Tax rate: Configurable in settings
- Payment methods: Cash, Online

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
└── vite.config.ts          # Vite build config
```

## How to Install as an App

### Desktop (Chrome, Edge, Brave)
1. Open the app in your browser
2. Look for the **Install** button in the address bar (or use the three dots menu)
3. Click "Install Café Bara POS"
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

## Notes
- No external authentication required (local login)
- Tax calculation applied automatically at checkout
- Order history preserved in database
- Charts optimized to show last 30 days of revenue data
- Tooltips have adaptive colors for dark/light modes
