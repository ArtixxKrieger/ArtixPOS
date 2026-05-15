<div align="center">
  <br />
  <img src="client/public/logo192.png" width="96" alt="ArtixPOS" />
  <br /><br />

  <h1>ArtixPOS — Business OS</h1>

  <p>
    <b>The complete Point of Sale & Business Management platform for Filipino businesses.</b><br />
    From the counter to the cloud — sales, staff, inventory, AI, and compliance in one place.
  </p>

  <br />

  <a href="#"><img src="https://img.shields.io/badge/React_18-20232A?style=for-the-badge&logo=react&logoColor=61DAFB" alt="React" /></a>
  <a href="#"><img src="https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript" /></a>
  <a href="#"><img src="https://img.shields.io/badge/Express_5-000000?style=for-the-badge&logo=express&logoColor=white" alt="Express" /></a>
  <a href="#"><img src="https://img.shields.io/badge/PostgreSQL-316192?style=for-the-badge&logo=postgresql&logoColor=white" alt="PostgreSQL" /></a>
  <a href="#"><img src="https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white" alt="Tailwind" /></a>
  <a href="#"><img src="https://img.shields.io/badge/PWA-5A0FC8?style=for-the-badge&logo=pwa&logoColor=white" alt="PWA" /></a>

  <br /><br />

  <img src="https://img.shields.io/badge/Offline_Ready-✓-brightgreen?style=flat-square" />
  <img src="https://img.shields.io/badge/Multi--Branch-✓-brightgreen?style=flat-square" />
  <img src="https://img.shields.io/badge/BIR_Compliant-✓-brightgreen?style=flat-square" />
  <img src="https://img.shields.io/badge/AI_Powered-✓-brightgreen?style=flat-square" />
  <img src="https://img.shields.io/badge/License-All_Rights_Reserved-red?style=flat-square" />

  <br /><br />

  <img src="screenshots/login.jpg" width="900" alt="ArtixPOS Screenshot" />

  <br /><br />
  <i>Your store. Fully in control.</i>
  <br /><br />

</div>

---

## 📖 Overview

ArtixPOS is a **full-stack, multi-tenant Business Operating System** designed specifically for modern Philippine businesses — retailers, restaurants, salons, clinics, pharmacies, hotels, and more.

It brings together every tool a business owner needs into one fast, offline-capable platform:

> Replace your disconnected spreadsheets, paper logs, and siloed apps with a single system that works — even without internet.

<br />

<table>
  <tr>
    <td align="center" width="200">
      <br />
      ⚡
      <br /><b>Blazing Fast</b><br />
      <sub>Sub-50ms API responses with two-tier caching</sub>
      <br /><br />
    </td>
    <td align="center" width="200">
      <br />
      📶
      <br /><b>Works Offline</b><br />
      <sub>Full POS operation without internet via IndexedDB</sub>
      <br /><br />
    </td>
    <td align="center" width="200">
      <br />
      🏢
      <br /><b>Multi-Branch</b><br />
      <sub>One account for all your store locations</sub>
      <br /><br />
    </td>
    <td align="center" width="200">
      <br />
      🇵🇭
      <br /><b>BIR Ready</b><br />
      <sub>X/Z-Reports, e-Journal, OR Numbers, VAT</sub>
      <br /><br />
    </td>
  </tr>
</table>

---

## ✨ Features

### 🛒 Point of Sale
- Touch-optimized register with barcode scanner support
- Product variants, sizes, modifiers, and add-ons
- Cash, card, GCash, and Maya payment types
- WiFi voucher auto-generation on printed receipts
- Pending orders queue — dine-in, takeout, delivery
- Full offline mode: sales saved locally and synced when back online

### 📦 Inventory & Products
- Complete product catalog with categories, SKUs, and barcodes
- Real-time stock tracking with low-stock threshold alerts
- Expiry date & batch number tracking (pharmacy / grocery)
- Supplier directory and Purchase Order management

### 📊 Analytics & Reports
- Live revenue dashboard — daily, weekly, monthly breakdowns
- Top products, category performance, and hourly traffic heatmaps
- Shift reports with cash drawer open/close reconciliation
- Expense tracking to show true net profit

### 🇵🇭 BIR Compliance
| Feature | Details |
|---|---|
| X-Reports | Per-shift transaction summary |
| Z-Reports | End-of-day fiscal report |
| e-Journal | Downloadable electronic journal |
| VAT Breakdown | VATable / VAT-exempt / zero-rated |
| Form 2550M | Monthly VAT worksheet |
| OR Sequencing | Atomic official receipt numbering |
| SC/PWD Discounts | Senior citizen and PWD exemptions |
| Audit Trail | Tamper-evident log for voided transactions |

### 👥 Customer & Loyalty
- Customer profiles with full transaction history
- Multi-tiered loyalty points with birthday and referral bonuses
- Digital stamp cards (e.g., "Buy 10, get 1 free")
- Membership and subscription plans
- Discount codes with usage caps, minimum order rules, and expiry dates

### 🏢 Staff & Payroll
- Staff profiles, service specialties, and role-based permissions
- Time clock with clock-in / clock-out tracking
- Payroll computation — hourly rate, monthly salary, or commission-based
- Appointment & calendar booking (salons, clinics, gyms)
- Service staff assignment per transaction

### 🍽️ Industry Modules

<table>
  <tr>
    <th>Module</th>
    <th>Built For</th>
    <th>Key Capability</th>
  </tr>
  <tr>
    <td>🍳 Kitchen Display System</td>
    <td>Restaurants & cafes</td>
    <td>Real-time order queue for kitchen staff</td>
  </tr>
  <tr>
    <td>🪑 Table & Floor Management</td>
    <td>Dine-in restaurants & bars</td>
    <td>Visual table layout — available, occupied, reserved</td>
  </tr>
  <tr>
    <td>📅 Appointment Calendar</td>
    <td>Salons, clinics, spas</td>
    <td>Booking system with staff assignment</td>
  </tr>
  <tr>
    <td>🛏️ Room Management</td>
    <td>Hotels & guesthouses</td>
    <td>Room status tracking and occupancy</td>
  </tr>
  <tr>
    <td>💊 Expiry Tracking</td>
    <td>Pharmacies & groceries</td>
    <td>Batch numbers, generic names, expiry alerts</td>
  </tr>
</table>

### 🤖 AI Business Assistant
- Intelligent business insights powered by multiple AI providers
- Automatic failover — if one provider is down, the next takes over seamlessly
- Works **fully offline** using a local AI model when there's no internet
- Accessible via a floating button on every screen

---

## 🛠️ Tech Stack

<table>
  <tr>
    <td><b>Frontend</b></td>
    <td>
      <img src="https://img.shields.io/badge/React_18-20232A?style=flat-square&logo=react&logoColor=61DAFB" />
      <img src="https://img.shields.io/badge/Vite-646CFF?style=flat-square&logo=vite&logoColor=white" />
      <img src="https://img.shields.io/badge/TypeScript-007ACC?style=flat-square&logo=typescript&logoColor=white" />
      <img src="https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=flat-square&logo=tailwind-css&logoColor=white" />
      <img src="https://img.shields.io/badge/Radix_UI-161618?style=flat-square&logo=radix-ui&logoColor=white" />
      <img src="https://img.shields.io/badge/Framer_Motion-0055FF?style=flat-square&logo=framer&logoColor=white" />
    </td>
  </tr>
  <tr>
    <td><b>Backend</b></td>
    <td>
      <img src="https://img.shields.io/badge/Express_5-000000?style=flat-square&logo=express&logoColor=white" />
      <img src="https://img.shields.io/badge/Node.js-339933?style=flat-square&logo=nodedotjs&logoColor=white" />
      <img src="https://img.shields.io/badge/TypeScript-007ACC?style=flat-square&logo=typescript&logoColor=white" />
    </td>
  </tr>
  <tr>
    <td><b>Database</b></td>
    <td>
      <img src="https://img.shields.io/badge/PostgreSQL-316192?style=flat-square&logo=postgresql&logoColor=white" />
      <img src="https://img.shields.io/badge/Drizzle_ORM-C5F74F?style=flat-square&logo=drizzle&logoColor=black" />
    </td>
  </tr>
  <tr>
    <td><b>Offline / PWA</b></td>
    <td>
      <img src="https://img.shields.io/badge/Service_Worker-5A0FC8?style=flat-square&logo=pwa&logoColor=white" />
      <img src="https://img.shields.io/badge/IndexedDB-FF6B35?style=flat-square&logoColor=white" />
    </td>
  </tr>
  <tr>
    <td><b>AI</b></td>
    <td>
      <img src="https://img.shields.io/badge/Groq-F55036?style=flat-square&logoColor=white" />
      <img src="https://img.shields.io/badge/Cerebras-1A1A2E?style=flat-square&logoColor=white" />
      <img src="https://img.shields.io/badge/Mistral-FF7000?style=flat-square&logoColor=white" />
      <img src="https://img.shields.io/badge/Ollama_(offline)-000000?style=flat-square&logoColor=white" />
    </td>
  </tr>
  <tr>
    <td><b>Mobile</b></td>
    <td>
      <img src="https://img.shields.io/badge/Capacitor-119EFF?style=flat-square&logo=capacitor&logoColor=white" />
      <img src="https://img.shields.io/badge/Android-3DDC84?style=flat-square&logo=android&logoColor=white" />
      <img src="https://img.shields.io/badge/iOS-000000?style=flat-square&logo=apple&logoColor=white" />
    </td>
  </tr>
  <tr>
    <td><b>Deployment</b></td>
    <td>
      <img src="https://img.shields.io/badge/Vercel-000000?style=flat-square&logo=vercel&logoColor=white" />
      <img src="https://img.shields.io/badge/Self--Hosted_Cluster-1C1C1C?style=flat-square&logo=linux&logoColor=white" />
    </td>
  </tr>
</table>

---

## 📱 Offline-First Architecture

ArtixPOS is a **Progressive Web App** built to survive real-world conditions — power cuts, weak signal, dead routers.

```
User sells offline  →  Saved to IndexedDB
Connection returns  →  Mutation queue syncs automatically
App always loads    →  Service Worker serves from cache
AI still works      →  Local model handles queries offline
```

Everything syncs the moment connectivity is restored — no data lost, no manual intervention needed.

---

## ⚖️ License

**Copyright © 2025 ArtixPOS. All Rights Reserved.**

This repository is shared for **portfolio and demonstration purposes only.**  
No part of this codebase may be copied, modified, redistributed, or used in any product without explicit written permission from the author.

---

<div align="center">
  <br />
  <img src="client/public/logo192.png" width="40" alt="ArtixPOS" />
  <br />
  <sub>Built with care for Filipino businesses 🇵🇭</sub>
  <br /><br />
</div>
