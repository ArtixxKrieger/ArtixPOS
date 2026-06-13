import { EventEmitter } from "events";

const bus = new EventEmitter();
bus.setMaxListeners(0);

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
