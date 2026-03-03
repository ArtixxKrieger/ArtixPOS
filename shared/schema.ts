import { pgTable, text, serial, integer, boolean, timestamp, numeric, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const products = pgTable("products", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  price: numeric("price").notNull(),
  category: text("category").default("General"),
  hasSizes: boolean("has_sizes").default(false),
  hasModifiers: boolean("has_modifiers").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const productSizes = pgTable("product_sizes", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").references(() => products.id).notNull(),
  sizeName: text("size_name").notNull(),
  price: numeric("price").notNull(),
});

export const productModifiers = pgTable("product_modifiers", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").references(() => products.id).notNull(),
  modifierName: text("modifier_name").notNull(),
  price: numeric("price").notNull(),
});

export const pendingOrders = pgTable("pending_orders", {
  id: serial("id").primaryKey(),
  items: jsonb("items").notNull(),
  subtotal: numeric("subtotal").notNull(),
  tax: numeric("tax").default("0"),
  discount: numeric("discount").default("0"),
  total: numeric("total").notNull(),
  paymentMethod: text("payment_method").default("cash"),
  paymentAmount: numeric("payment_amount").default("0"),
  changeAmount: numeric("change_amount").default("0"),
  status: text("status").default("unpaid"),
  customerName: text("customer_name"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const sales = pgTable("sales", {
  id: serial("id").primaryKey(),
  items: jsonb("items").notNull(),
  subtotal: numeric("subtotal").notNull(),
  tax: numeric("tax").default("0"),
  discount: numeric("discount").default("0"),
  total: numeric("total").notNull(),
  paymentMethod: text("payment_method").default("cash"),
  paymentAmount: numeric("payment_amount").default("0"),
  changeAmount: numeric("change_amount").default("0"),
  customerName: text("customer_name"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const userSettings = pgTable("user_settings", {
  id: serial("id").primaryKey(),
  storeName: text("store_name").default("My Store"),
  currency: text("currency").default("₱"),
  taxRate: numeric("tax_rate").default("0"),
  address: text("address"),
  phone: text("phone"),
  emailContact: text("email_contact"),
  receiptFooter: text("receipt_footer").default("Thank you for your business!"),
});

export const insertProductSchema = createInsertSchema(products).omit({ id: true, createdAt: true });
export const insertProductSizeSchema = createInsertSchema(productSizes).omit({ id: true });
export const insertProductModifierSchema = createInsertSchema(productModifiers).omit({ id: true });
export const insertPendingOrderSchema = createInsertSchema(pendingOrders).omit({ id: true, createdAt: true });
export const insertSaleSchema = createInsertSchema(sales).omit({ id: true, createdAt: true });
export const insertUserSettingSchema = createInsertSchema(userSettings).omit({ id: true });

export type Product = typeof products.$inferSelect;
export type ProductSize = typeof productSizes.$inferSelect;
export type ProductModifier = typeof productModifiers.$inferSelect;
export type PendingOrder = typeof pendingOrders.$inferSelect;
export type Sale = typeof sales.$inferSelect;
export type UserSetting = typeof userSettings.$inferSelect;

export type InsertProduct = z.infer<typeof insertProductSchema>;
export type InsertPendingOrder = z.infer<typeof insertPendingOrderSchema>;
export type InsertSale = z.infer<typeof insertSaleSchema>;
export type InsertUserSetting = z.infer<typeof insertUserSettingSchema>;
