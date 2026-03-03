import { db } from "./db";
import { 
  products, 
  productSizes,
  productModifiers,
  pendingOrders,
  sales,
  userSettings,
  type Product,
  type InsertProduct,
  type PendingOrder,
  type InsertPendingOrder,
  type Sale,
  type InsertSale,
  type UserSetting,
  type InsertUserSetting
} from "@shared/schema";
import { eq } from "drizzle-orm";

export interface IStorage {
  // Products
  getProducts(): Promise<Product[]>;
  getProduct(id: number): Promise<Product | undefined>;
  createProduct(product: InsertProduct): Promise<Product>;
  updateProduct(id: number, product: Partial<InsertProduct>): Promise<Product>;
  deleteProduct(id: number): Promise<void>;

  // Pending Orders
  getPendingOrders(): Promise<PendingOrder[]>;
  getPendingOrder(id: number): Promise<PendingOrder | undefined>;
  createPendingOrder(order: InsertPendingOrder): Promise<PendingOrder>;
  updatePendingOrder(id: number, order: Partial<InsertPendingOrder>): Promise<PendingOrder>;
  deletePendingOrder(id: number): Promise<void>;

  // Sales
  getSales(): Promise<Sale[]>;
  createSale(sale: InsertSale): Promise<Sale>;

  // Settings
  getSettings(): Promise<UserSetting | undefined>;
  updateSettings(settings: Partial<InsertUserSetting>): Promise<UserSetting>;
}

export class DatabaseStorage implements IStorage {
  // Products
  async getProducts(): Promise<Product[]> {
    return await db.select().from(products);
  }

  async getProduct(id: number): Promise<Product | undefined> {
    const [product] = await db.select().from(products).where(eq(products.id, id));
    return product;
  }

  async createProduct(product: InsertProduct): Promise<Product> {
    const [created] = await db.insert(products).values(product).returning();
    return created;
  }

  async updateProduct(id: number, product: Partial<InsertProduct>): Promise<Product> {
    const [updated] = await db.update(products).set(product).where(eq(products.id, id)).returning();
    return updated;
  }

  async deleteProduct(id: number): Promise<void> {
    await db.delete(products).where(eq(products.id, id));
  }

  // Pending Orders
  async getPendingOrders(): Promise<PendingOrder[]> {
    return await db.select().from(pendingOrders);
  }

  async getPendingOrder(id: number): Promise<PendingOrder | undefined> {
    const [order] = await db.select().from(pendingOrders).where(eq(pendingOrders.id, id));
    return order;
  }

  async createPendingOrder(order: InsertPendingOrder): Promise<PendingOrder> {
    const [created] = await db.insert(pendingOrders).values(order).returning();
    return created;
  }

  async updatePendingOrder(id: number, order: Partial<InsertPendingOrder>): Promise<PendingOrder> {
    const [updated] = await db.update(pendingOrders).set(order).where(eq(pendingOrders.id, id)).returning();
    return updated;
  }

  async deletePendingOrder(id: number): Promise<void> {
    await db.delete(pendingOrders).where(eq(pendingOrders.id, id));
  }

  // Sales
  async getSales(): Promise<Sale[]> {
    return await db.select().from(sales);
  }

  async createSale(sale: InsertSale): Promise<Sale> {
    const [created] = await db.insert(sales).values(sale).returning();
    return created;
  }

  // Settings
  async getSettings(): Promise<UserSetting | undefined> {
    const [setting] = await db.select().from(userSettings).limit(1);
    return setting;
  }

  async updateSettings(settings: Partial<InsertUserSetting>): Promise<UserSetting> {
    const existing = await this.getSettings();
    if (existing) {
      const [updated] = await db.update(userSettings).set(settings).where(eq(userSettings.id, existing.id)).returning();
      return updated;
    } else {
      const [created] = await db.insert(userSettings).values(settings as InsertUserSetting).returning();
      return created;
    }
  }
}

export const storage = new DatabaseStorage();
