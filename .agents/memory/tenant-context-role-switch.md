---
name: Tenant context SET LOCAL ROLE bug
description: Root cause and fix for the "current transaction is aborted" (25P02) error on settings save
---

# Root Cause: SET LOCAL ROLE aborts PostgreSQL transaction

## The Rule
Always wrap `SET LOCAL ROLE` (and any DDL/role command) in a SAVEPOINT when inside an open transaction. In PostgreSQL, **any error inside a transaction — even one caught in JavaScript — marks the entire transaction as ABORTED**. Subsequent queries on the same connection all fail with 25P02 until ROLLBACK is issued.

## Why
`SET LOCAL ROLE artixpos_app` in `server/tenant-context.ts` failed with "permission denied to set role" on Supabase because the pool user (`postgres`) was not a member of `artixpos_app`. The JS catch block logged a warning and continued, but the PostgreSQL connection was already in ABORTED state — so `SELECT set_config(...)` and every following query failed with 25P02. This produced the "current transaction is aborted" toast the user saw when saving settings.

## How to Apply
- In `server/tenant-context.ts`: SAVEPOINT is now issued before `SET LOCAL ROLE`, with `ROLLBACK TO SAVEPOINT` in the catch. This keeps the transaction alive even when the role switch fails.
- In `server/rls-setup.ts`: `GRANT artixpos_app TO current_user` is now issued at startup so the role switch succeeds in future.
- On any managed PostgreSQL (Supabase, Neon, etc.): the pool user may not have membership in custom roles. Always grant it explicitly in `setupRLS`.
- The fix must also be applied directly to the production DB (run the GRANT SQL) since Vercel doesn't redeploy automatically.

## Production Fix Applied
`GRANT artixpos_app TO postgres` was executed directly on the Supabase production DB. The settings save flow now works without a Vercel redeploy.
