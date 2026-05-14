import { EventEmitter } from "events";

// ── In-process tenant event bus ────────────────────────────────────────────
// Routes emit events here; SSE endpoints subscribe and forward them to the
// connected browser.  All events are scoped by tenantId so tenants never
// see each other's data.
//
// This is intentionally simple (no Redis pub/sub) — it works perfectly for a
// single-process Node server and requires zero extra infrastructure.  If the
// app is ever scaled to multiple processes, swap the body for an Upstash
// Redis pub/sub adapter while keeping the same API surface.

const bus = new EventEmitter();
bus.setMaxListeners(0); // unlimited — one listener per connected SSE client

export type TenantEvent =
  | { type: "kitchen-update"; orderId: number; kitchenStatus: string; orderNumber: number | null }
  | { type: "kitchen-new-order"; orderId: number; orderNumber: number | null; itemCount: number }
  | { type: "low-stock"; productId: number; productName: string; stock: number }
  | { type: "new-order"; orderId: number }
  | { type: "stats-update"; saleId: number; total: string };

export function emit(tenantId: string, event: TenantEvent): void {
  bus.emit(`tenant:${tenantId}`, event);
}

export function subscribe(
  tenantId: string,
  fn: (event: TenantEvent) => void
): () => void {
  const key = `tenant:${tenantId}`;
  bus.on(key, fn);
  return () => bus.off(key, fn);
}
