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
  updateProduct(id: number, product: Partial<InsertProduct>): Promise<Product | undefined>;
  deleteProduct(id: number): Promise<void>;

  // Pending Orders
  getPendingOrders(): Promise<PendingOrder[]>;
  getPendingOrder(id: number): Promise<PendingOrder | undefined>;
  createPendingOrder(order: InsertPendingOrder): Promise<PendingOrder>;
  updatePendingOrder(id: number, order: Partial<InsertPendingOrder>): Promise<PendingOrder | undefined>;
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
    try {
      return await db.select().from(products);
    } catch (error) {
      console.error("Error fetching products:", error);
      return [];
    }
  }

  async getProduct(id: number): Promise<Product | undefined> {
    try {
      const [product] = await db.select().from(products).where(eq(products.id, id));
      return product;
    } catch (error) {
      console.error("Error fetching product:", error);
      return undefined;
    }
  }

  async createProduct(product: InsertProduct): Promise<Product> {
    try {
      const [created] = await db.insert(products).values(product as any).returning();
      return created;
    } catch (error) {
      console.error("Error creating product:", error);
      throw error;
    }
  }

  async updateProduct(id: number, product: Partial<InsertProduct>): Promise<Product | undefined> {
    try {
      const [updated] = await db.update(products).set(product as any).where(eq(products.id, id)).returning();
      return updated;
    } catch (error) {
      console.error("Error updating product:", error);
      return undefined;
    }
  }

  async deleteProduct(id: number): Promise<void> {
    try {
      await db.delete(products).where(eq(products.id, id));
    } catch (error) {
      console.error("Error deleting product:", error);
      throw error;
    }
  }

  // Pending Orders
  async getPendingOrders(): Promise<PendingOrder[]> {
    try {
      return await db.select().from(pendingOrders);
    } catch (error) {
      console.error("Error fetching pending orders:", error);
      return [];
    }
  }

  async getPendingOrder(id: number): Promise<PendingOrder | undefined> {
    try {
      const [order] = await db.select().from(pendingOrders).where(eq(pendingOrders.id, id));
      return order;
    } catch (error) {
      console.error("Error fetching pending order:", error);
      return undefined;
    }
  }

  async createPendingOrder(order: InsertPendingOrder): Promise<PendingOrder> {
    try {
      const [created] = await db.insert(pendingOrders).values(order as any).returning();
      return created;
    } catch (error) {
      console.error("Error creating pending order:", error);
      throw error;
    }
  }

  async updatePendingOrder(id: number, order: Partial<InsertPendingOrder>): Promise<PendingOrder | undefined> {
    try {
      const [updated] = await db.update(pendingOrders).set(order as any).where(eq(pendingOrders.id, id)).returning();
      return updated;
    } catch (error) {
      console.error("Error updating pending order:", error);
      return undefined;
    }
  }

  async deletePendingOrder(id: number): Promise<void> {
    try {
      await db.delete(pendingOrders).where(eq(pendingOrders.id, id));
    } catch (error) {
      console.error("Error deleting pending order:", error);
      throw error;
    }
  }

  // Sales
  async getSales(): Promise<Sale[]> {
    try {
      return await db.select().from(sales);
    } catch (error) {
      console.error("Error fetching sales:", error);
      return [];
    }
  }

  async createSale(sale: InsertSale): Promise<Sale> {
    try {
      const [created] = await db.insert(sales).values(sale as any).returning();
      return created;
    } catch (error) {
      console.error("Error creating sale:", error);
      throw error;
    }
  }

  // Settings
  async getSettings(): Promise<UserSetting | undefined> {
    try {
      const [setting] = await db.select().from(userSettings).limit(1);
      return setting;
    } catch (error) {
      console.error("Error fetching settings:", error);
      return undefined;
    }
  }

  async updateSettings(settings: Partial<InsertUserSetting>): Promise<UserSetting> {
    try {
      const existing = await this.getSettings();
      if (existing) {
        const [updated] = await db.update(userSettings)
          .set(settings as any)
          .where(eq(userSettings.id, existing.id))
          .returning();
        return updated;
      } else {
        const [created] = await db.insert(userSettings)
          .values(settings as any)
          .returning();
        return created;
      }
    } catch (error) {
      console.error("Error updating settings:", error);
      throw error;
    }
  }
}

export const storage = new DatabaseStorage();