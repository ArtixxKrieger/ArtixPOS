import type { Product, InsertProduct, StockLog } from "@shared/schema";

export interface IProductRepository {
  getProducts(
    userId: string,
    branchIdOrOpts?: number | null | { branchId?: number | null; limit?: number; offset?: number },
  ): Promise<Product[]>;
  getLowStockProducts(userId: string, branchId?: number | null): Promise<Product[]>;
  getProduct(id: number, userId: string): Promise<Product | undefined>;
  getProductByBarcode(barcode: string, userId: string): Promise<Product | undefined>;
  createProduct(userId: string, product: Omit<InsertProduct, "userId">): Promise<Product>;
  updateProduct(id: number, userId: string, product: Partial<InsertProduct>): Promise<Product | undefined>;
  deleteProduct(id: number, userId: string): Promise<void>;
  adjustStock(id: number, userId: string, delta: number): Promise<Product | undefined>;
  setStock(id: number, userId: string, newStock: number): Promise<Product | undefined>;
  getStockLogs(productId: number, userId: string): Promise<StockLog[]>;
  deductProductStockForSale(userId: string, items: any[]): Promise<void>;
}
