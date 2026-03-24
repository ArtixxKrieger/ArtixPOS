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
import { eq, and } from "drizzle-orm";

export interface IStorage {
  // Products
  getProducts(userId: string): Promise<Product[]>;
  getProduct(id: number, userId: string): Promise<Product | undefined>;
  createProduct(userId: string, product: Omit<InsertProduct, "userId">): Promise<Product>;
  updateProduct(id: number, userId: string, product: Partial<InsertProduct>): Promise<Product | undefined>;
  deleteProduct(id: number, userId: string): Promise<void>;

  // Pending Orders
  getPendingOrders(userId: string): Promise<PendingOrder[]>;
  getPendingOrder(id: number, userId: string): Promise<PendingOrder | undefined>;
  createPendingOrder(userId: string, order: Omit<InsertPendingOrder, "userId">): Promise<PendingOrder>;
  updatePendingOrder(id: number, userId: string, order: Partial<InsertPendingOrder>): Promise<PendingOrder | undefined>;
  deletePendingOrder(id: number, userId: string): Promise<void>;

  // Sales
  getSales(userId: string): Promise<Sale[]>;
  createSale(userId: string, sale: Omit<InsertSale, "userId">): Promise<Sale>;

  // Settings
  getSettings(userId: string): Promise<UserSetting | undefined>;
  updateSettings(userId: string, settings: Partial<InsertUserSetting>): Promise<UserSetting>;
}

export class DatabaseStorage implements IStorage {
  // Products
  async getProducts(userId: string): Promise<Product[]> {
    try {
      return await db.select().from(products).where(eq(products.userId, userId));
    } catch (error) {
      console.error("Error fetching products:", error);
      return [];
    }
  }

  async getProduct(id: number, userId: string): Promise<Product | undefined> {
    try {
      const [product] = await db.select().from(products).where(
        and(eq(products.id, id), eq(products.userId, userId))
      );
      return product;
    } catch (error) {
      console.error("Error fetching product:", error);
      return undefined;
    }
  }

  async createProduct(userId: string, product: Omit<InsertProduct, "userId">): Promise<Product> {
    try {
      const [created] = await db.insert(products).values({ ...product, userId } as any).returning();
      return created;
    } catch (error) {
      console.error("Error creating product:", error);
      throw error;
    }
  }

  async updateProduct(id: number, userId: string, product: Partial<InsertProduct>): Promise<Product | undefined> {
    try {
      const [updated] = await db.update(products)
        .set(product as any)
        .where(and(eq(products.id, id), eq(products.userId, userId)))
        .returning();
      return updated;
    } catch (error) {
      console.error("Error updating product:", error);
      return undefined;
    }
  }

  async deleteProduct(id: number, userId: string): Promise<void> {
    try {
      await db.delete(products).where(and(eq(products.id, id), eq(products.userId, userId)));
    } catch (error) {
      console.error("Error deleting product:", error);
      throw error;
    }
  }

  // Pending Orders
  async getPendingOrders(userId: string): Promise<PendingOrder[]> {
    try {
      return await db.select().from(pendingOrders).where(eq(pendingOrders.userId, userId));
    } catch (error) {
      console.error("Error fetching pending orders:", error);
      return [];
    }
  }

  async getPendingOrder(id: number, userId: string): Promise<PendingOrder | undefined> {
    try {
      const [order] = await db.select().from(pendingOrders).where(
        and(eq(pendingOrders.id, id), eq(pendingOrders.userId, userId))
      );
      return order;
    } catch (error) {
      console.error("Error fetching pending order:", error);
      return undefined;
    }
  }

  async createPendingOrder(userId: string, order: Omit<InsertPendingOrder, "userId">): Promise<PendingOrder> {
    try {
      const [created] = await db.insert(pendingOrders).values({ ...order, userId } as any).returning();
      return created;
    } catch (error) {
      console.error("Error creating pending order:", error);
      throw error;
    }
  }

  async updatePendingOrder(id: number, userId: string, order: Partial<InsertPendingOrder>): Promise<PendingOrder | undefined> {
    try {
      const [updated] = await db.update(pendingOrders)
        .set(order as any)
        .where(and(eq(pendingOrders.id, id), eq(pendingOrders.userId, userId)))
        .returning();
      return updated;
    } catch (error) {
      console.error("Error updating pending order:", error);
      return undefined;
    }
  }

  async deletePendingOrder(id: number, userId: string): Promise<void> {
    try {
      await db.delete(pendingOrders).where(and(eq(pendingOrders.id, id), eq(pendingOrders.userId, userId)));
    } catch (error) {
      console.error("Error deleting pending order:", error);
      throw error;
    }
  }

  // Sales
  async getSales(userId: string): Promise<Sale[]> {
    try {
      return await db.select().from(sales).where(eq(sales.userId, userId));
    } catch (error) {
      console.error("Error fetching sales:", error);
      return [];
    }
  }

  async createSale(userId: string, sale: Omit<InsertSale, "userId">): Promise<Sale> {
    try {
      const [created] = await db.insert(sales).values({ ...sale, userId } as any).returning();
      return created;
    } catch (error) {
      console.error("Error creating sale:", error);
      throw error;
    }
  }

  // Settings
  async getSettings(userId: string): Promise<UserSetting | undefined> {
    try {
      const [setting] = await db.select().from(userSettings).where(eq(userSettings.userId, userId));
      return setting;
    } catch (error) {
      console.error("Error fetching settings:", error);
      return undefined;
    }
  }

  async updateSettings(userId: string, settings: Partial<InsertUserSetting>): Promise<UserSetting> {
    try {
      const existing = await this.getSettings(userId);
      if (existing) {
        const [updated] = await db.update(userSettings)
          .set(settings as any)
          .where(eq(userSettings.userId, userId))
          .returning();
        return updated;
      } else {
        const [created] = await db.insert(userSettings)
          .values({ ...settings, userId } as any)
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
