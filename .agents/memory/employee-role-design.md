---
name: Employee role design
description: How the "staff" role separates clock-in-only employees from POS users in ArtixPOS.
---

## Rule
The `staff` role is for employees who only need to clock in/out — they never access the POS or dashboard.

## What changed
- `users.role` accepts `"staff"` as a valid value (text column, no migration needed)
- `createStaffUser` and `updateUserRole` in `admin-storage.ts` accept `"staff"`
- `admin-routes.ts` POST and PUT endpoints accept `"staff"` in the role enum
- `PinSessionApp` branches: `user.role === "staff"` → renders `<TimeClockPage />` (locked to `/timeclock`); other roles → renders `<POS />` (locked to `/pos`)
- `admin/users.tsx` displays `staff` role as "Employee" via `ROLE_LABELS` map
- Staff role users appear on the kiosk roster automatically (they're in `userBranches` like anyone else)

## Why
Businesses have many employees (kitchen, cleaning, delivery) who need time tracking but not POS access. Previously, the only way to add them was as "cashier" which gave unintended POS access.

## How to apply
- When adding new role-aware logic, always check for `"staff"` in addition to `owner/manager/admin/cashier`
- `staff` role has no app access — treat it below cashier in all permission hierarchies
- The `CashierGuard` already blocks staff (they never reach app routes)
- `isManagerOrAbove` in backend middleware also excludes staff correctly
