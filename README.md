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
[![License](https://img.shields.io/badge/License-All_Rights_Reserved-red?style=flat-square)](#license)

<br />

![ArtixPOS Login Screen](screenshots/login.jpg)

</div>

---

## What is ArtixPOS?

ArtixPOS is a full-stack, multi-tenant **Business Operating System** built for modern Philippine retailers, restaurants, salons, clinics, and service businesses. It replaces a handful of disconnected tools with a single, fast, and offline-capable platform — from ringing up a sale to filing your BIR Z-Report.

> Built with speed in mind. Works without internet. Scales from a single register to a multi-branch enterprise.

> **Note:** This repository is a portfolio showcase. The source code is not licensed for reuse, forking, or self-hosting. See [License](#license).

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
- Live revenue dashboard with charts
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
- Tamper-evident audit log for voided transactions

### 👥 Customer & Loyalty
- Customer profiles with full purchase history
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
- Multi-provider AI with automatic failover
- Works offline with a local model when internet is unavailable
- Accessible from a floating button on every page

### 🌐 Multi-Branch & Admin
- Manage multiple store branches from one account
- Per-branch inventory, staff, and analytics
- Global admin panel: user management, audit logs, permissions
- Dynamic UI that adapts labels and modules to your business type

### 📱 Offline-First PWA
- Full sale processing while offline via IndexedDB
- Service Worker caches the entire app shell
- Automatic background sync when connectivity returns
- Installable on desktop and mobile (Add to Home Screen)

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | React 18, Vite, TypeScript, Tailwind CSS, Radix UI, Framer Motion |
| **Routing** | Wouter |
| **Data Fetching** | TanStack Query v5 |
| **Backend** | Express 5, Node.js, TypeScript |
| **Database** | PostgreSQL via Drizzle ORM |
| **Offline** | Service Worker (PWA), IndexedDB, mutation sync queue |
| **AI** | Multi-provider router with circuit breakers + local offline fallback |
| **Mobile** | Capacitor (Android / iOS) |
| **Deployment** | Vercel (serverless) · Node cluster (self-hosted) |

---

## License

Copyright © 2025 ArtixPOS. **All rights reserved.**

This repository is shared for **portfolio and demonstration purposes only**. No part of this codebase may be copied, modified, distributed, or used in any form without explicit written permission from the author.

---

<div align="center">

Built with care for Filipino businesses. 🇵🇭

</div>
