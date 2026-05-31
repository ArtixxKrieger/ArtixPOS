---
name: POS Feature Flags system
description: How posFeatures is stored, guarded, and consumed — plus the DB migration needed.
---

## What it is
`posFeatures` is a JSONB column in `user_settings` that stores per-tenant POS feature toggles.
Type `PosFeatures` and constants `PRO_POS_FEATURE_KEYS` / `DEFAULT_POS_FEATURES` are exported from `shared/schema.ts`.

## DB migration required
`migrations/add_pos_features.sql` — must be run once against production Supabase:
```sql
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS pos_features JSONB DEFAULT NULL;
```

## Free vs Pro split
- Free: takeout, delivery, barcodeScanning, receiptName, customerAccounts
- Pro (stripped server-side in settings route if not subscribed): tables, kitchenDisplay, splitBill, loyalty

## Key files
- `shared/schema.ts` — type + constants
- `client/src/hooks/use-pos-features.ts` — hook (reads from useSettings, calls useUpdateSettings)
- `client/src/pages/features.tsx` — setup wizard (`?setup=1`) + ongoing settings page
- `client/src/App.tsx` — `POSWithSetupGuard` wraps POS in PersistentRoute; redirects to `/features?setup=1` when posFeatures is null and location === "/pos"
- `server/routes/settings.ts` — Pro guard strips Pro posFeature flags for free users

## Why
Business types (restaurant, cafe, bar) were too rigid. Owners can now freely mix features.
businessType/businessSubType still exists as a label/terminology system, but no longer controls feature availability.

**How to apply:** When adding a new POS feature toggle, add it to `PosFeatures` type, `PRO_POS_FEATURE_KEYS` (if Pro), `DEFAULT_POS_FEATURES`, and `FREE_FEATURES`/`PRO_FEATURES` arrays in `features.tsx`.
