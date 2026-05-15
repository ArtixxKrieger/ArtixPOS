<img src="https://capsule-render.vercel.app/api?type=waving&color=0:4F1FBF,50:7C3AED,100:A78BFA&height=200&section=header&text=ArtixPOS&fontSize=60&fontColor=ffffff&animation=fadeIn&fontAlignY=38&desc=Business%20OS%20for%20Filipino%20Stores&descAlignY=58&descSize=18&descColor=E9D5FF" width="100%" />

<div align="center">

<a href="#"><img src="https://readme-typing-svg.demolab.com?font=Inter&weight=600&size=18&pause=1000&color=7C3AED&center=true&vCenter=true&random=false&width=500&height=40&lines=Point+of+Sale+that+works+offline+%F0%9F%9B%92;BIR+Compliant+out+of+the+box+%F0%9F%87%B5%F0%9F%87%AD;AI+assistant+built+right+in+%F0%9F%A4%96;Multi-branch+%26+multi-staff+%F0%9F%8F%A2;Runs+on+Android+%26+iOS+too+%F0%9F%93%B1" alt="Typing SVG" /></a>

<br /><br />

<img src="https://img.shields.io/badge/Offline_Ready-%E2%9C%93-brightgreen?style=flat-square" />
<img src="https://img.shields.io/badge/Multi--Branch-%E2%9C%93-brightgreen?style=flat-square" />
<img src="https://img.shields.io/badge/BIR_Compliant-%E2%9C%93-brightgreen?style=flat-square" />
<img src="https://img.shields.io/badge/AI_Powered-%E2%9C%93-brightgreen?style=flat-square" />
[![CI](https://github.com/ArtixxKrieger/ArtixPOS/actions/workflows/ci.yml/badge.svg)](https://github.com/ArtixxKrieger/ArtixPOS/actions/workflows/ci.yml)
<img src="https://img.shields.io/badge/License-All_Rights_Reserved-red?style=flat-square" />

<br /><br />

<img src="screenshots/login.jpg" width="900" alt="ArtixPOS" />

</div>

<br />

## What is ArtixPOS?

ArtixPOS is a full-stack POS and business management system built for Filipino stores, restaurants, salons, clinics, pharmacies, hotels, and pretty much any business that needs more than just a cash register.

The goal was simple: one app that handles everything, works without internet, and actually makes sense to use day to day. No more jumping between a POS, a separate inventory tool, a spreadsheet for payroll, and another app for BIR reports.

> Works on the web, installable as a PWA, and wraps into native Android and iOS via Capacitor.

<br />

<table>
  <tr>
    <td align="center" width="200">
      <br />⚡<br />
      <b>Fast</b><br />
      <sub>Sub-50ms responses with two-tier caching</sub>
      <br /><br />
    </td>
    <td align="center" width="200">
      <br />📶<br />
      <b>Offline</b><br />
      <sub>Sell without internet, sync when you're back</sub>
      <br /><br />
    </td>
    <td align="center" width="200">
      <br />🏢<br />
      <b>Multi-Branch</b><br />
      <sub>All your locations under one account</sub>
      <br /><br />
    </td>
    <td align="center" width="200">
      <br />🇵🇭<br />
      <b>BIR Ready</b><br />
      <sub>X/Z-Reports, e-Journal, OR Numbers, VAT</sub>
      <br /><br />
    </td>
  </tr>
</table>

<br />

## Features

### 🛒 Point of Sale
- Touch-friendly register with barcode scanning built in
- Products support variants, sizes, modifiers, and add-ons
- Accepts cash, card, GCash, and Maya
- Auto-generates WiFi voucher codes on receipts
- Handles dine-in, takeout, and delivery queues
- Goes fully offline and syncs everything back when you reconnect

### 📦 Inventory and Products
- Full product catalog with categories, SKUs, and barcodes
- Stock levels update in real time with low-stock alerts
- Expiry date and batch number tracking for pharmacies and groceries
- Supplier profiles and Purchase Order tracking

### 📊 Analytics and Reports
- Revenue dashboard broken down by day, week, and month
- See your top products, category performance, and hourly traffic
- Shift reports with cash drawer reconciliation built in
- Expense tracking so you can see actual net profit

### 🇵🇭 BIR Compliance

| Feature | What it does |
|---|---|
| X-Reports | Shift-level transaction summary |
| Z-Reports | End-of-day fiscal report |
| e-Journal | Electronic journal you can download |
| VAT Breakdown | VATable, VAT-exempt, and zero-rated sales |
| Form 2550M | Monthly VAT worksheet ready to print |
| OR Sequencing | Official receipt numbers that never repeat |
| SC/PWD Discounts | Senior citizen and PWD exemptions handled automatically |
| Audit Trail | Every voided transaction is logged and tamper-evident |

### 👥 Customers and Loyalty
- Customer profiles with their full purchase history
- Loyalty points with birthday bonuses and referral rewards
- Digital stamp cards (buy 10, get 1 free style)
- Membership and subscription plans
- Promo codes with usage limits, minimum order rules, and expiry

### 🏢 Staff and Payroll
- Staff profiles with role-based access controls
- Time clock for clock-in and clock-out
- Payroll that handles hourly, monthly, and commission-based staff
- Calendar booking system for salons, clinics, and gyms
- Assign specific staff members to transactions

### 🍽️ Industry Modules

<table>
  <tr>
    <th>Module</th>
    <th>Who it's for</th>
    <th>What it does</th>
  </tr>
  <tr>
    <td>🍳 Kitchen Display System</td>
    <td>Restaurants and cafes</td>
    <td>Live order queue screen for kitchen staff</td>
  </tr>
  <tr>
    <td>🪑 Table and Floor Management</td>
    <td>Dine-in restaurants and bars</td>
    <td>Visual floor layout showing table status at a glance</td>
  </tr>
  <tr>
    <td>📅 Appointment Calendar</td>
    <td>Salons, clinics, spas</td>
    <td>Booking system with per-staff scheduling</td>
  </tr>
  <tr>
    <td>🛏️ Room Management</td>
    <td>Hotels and guesthouses</td>
    <td>Track room availability and occupancy</td>
  </tr>
  <tr>
    <td>💊 Expiry Tracking</td>
    <td>Pharmacies and groceries</td>
    <td>Batch numbers, generic names, and expiry alerts</td>
  </tr>
</table>

### 🤖 AI Business Assistant
- Pulls insights from your actual sales data
- Runs on multiple AI providers with automatic failover if one goes down
- Falls back to a local AI model when there's no internet at all
- Floating button keeps it one tap away from any screen

<br />

## Tech Stack

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
      <img src="https://img.shields.io/badge/Upstash_Redis-00E9A3?style=flat-square&logo=redis&logoColor=black" />
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

<br />

## How offline works

The app is a PWA so it installs like a native app and keeps working when the internet drops. Sales get written to IndexedDB on the device, a mutation queue tracks everything that happened while offline, and once connectivity comes back it syncs automatically. Nothing gets lost and nobody has to do anything manually.

```
Sell while offline   →  Saved to device (IndexedDB)
Back online          →  Queue syncs automatically
App won't load?      →  Service Worker serves it from cache
AI goes down?        →  Local model picks up the slack
```

<br />

## License

Copyright 2025 ArtixPOS. All rights reserved.

This repo is up for portfolio and demo purposes only. You can look but you can't copy, fork, or use any of this in your own projects without written permission from the author.

<br />

<img src="https://capsule-render.vercel.app/api?type=waving&color=0:4F1FBF,50:7C3AED,100:A78BFA&height=120&section=footer&animation=fadeIn" width="100%" />

<div align="center">
  <sub>Built for Filipino businesses 🇵🇭</sub>
</div>
