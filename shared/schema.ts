import { pgTable, text, serial, integer, boolean, timestamp, numeric, jsonb } from "drizzle-orm/pg-core";
import { sqliteTable, text as sqliteText, integer as sqliteInteger, numeric as sqliteNumeric } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Shared logic for SQLite
export const products = sqliteTable("products", {
  id: sqliteInteger("id").primaryKey({ autoIncrement: true }),
  name: sqliteText("name").notNull(),
  price: sqliteNumeric("price").notNull(),
  category: sqliteText("category").default("General"),
  hasSizes: sqliteInteger("has_sizes", { mode: "boolean" }).default(false),
  hasModifiers: sqliteInteger("has_modifiers", { mode: "boolean" }).default(false),
  sizes: sqliteText("sizes", { mode: "json" }).$type<{ name: string; price: string }[]>().default([]),
  modifiers: sqliteText("modifiers", { mode: "json" }).$type<{ name: string; price: string }[]>().default([]),
  createdAt: sqliteInteger("created_at", { mode: "timestamp" }).default(new Date()),
});

export const productSizes = sqliteTable("product_sizes", {
  id: sqliteInteger("id").primaryKey({ autoIncrement: true }),
  productId: sqliteInteger("product_id").references(() => products.id).notNull(),
  sizeName: sqliteText("size_name").notNull(),
  price: sqliteNumeric("price").notNull(),
});

export const productModifiers = sqliteTable("product_modifiers", {
  id: sqliteInteger("id").primaryKey({ autoIncrement: true }),
  productId: sqliteInteger("product_id").references(() => products.id).notNull(),
  modifierName: sqliteText("modifier_name").notNull(),
  price: sqliteNumeric("price").notNull(),
});

export const pendingOrders = sqliteTable("pending_orders", {
  id: sqliteInteger("id").primaryKey({ autoIncrement: true }),
  items: sqliteText("items", { mode: "json" }).notNull(),
  subtotal: sqliteNumeric("subtotal").notNull(),
  tax: sqliteNumeric("tax").default("0"),
  discount: sqliteNumeric("discount").default("0"),
  total: sqliteNumeric("total").notNull(),
  paymentMethod: sqliteText("payment_method").default("cash"),
  paymentAmount: sqliteNumeric("payment_amount").default("0"),
  changeAmount: sqliteNumeric("change_amount").default("0"),
  status: sqliteText("status").default("unpaid"),
  customerName: sqliteText("customer_name"),
  notes: sqliteText("notes"),
  createdAt: sqliteInteger("created_at", { mode: "timestamp" }).default(new Date()),
});

export const sales = sqliteTable("sales", {
  id: sqliteInteger("id").primaryKey({ autoIncrement: true }),
  items: sqliteText("items", { mode: "json" }).notNull(),
  subtotal: sqliteNumeric("subtotal").notNull(),
  tax: sqliteNumeric("tax").default("0"),
  discount: sqliteNumeric("discount").default("0"),
  total: sqliteNumeric("total").notNull(),
  paymentMethod: sqliteText("payment_method").default("cash"),
  paymentAmount: sqliteNumeric("payment_amount").default("0"),
  changeAmount: sqliteNumeric("change_amount").default("0"),
  customerName: sqliteText("customer_name"),
  notes: sqliteText("notes"),
  createdAt: sqliteInteger("created_at", { mode: "timestamp" }).default(new Date()),
});

export const userSettings = sqliteTable("user_settings", {
  id: sqliteInteger("id").primaryKey({ autoIncrement: true }),
  storeName: sqliteText("store_name").default("My Store"),
  currency: sqliteText("currency").default("₱"),
  taxRate: sqliteNumeric("tax_rate").default("0"),
  address: sqliteText("address"),
  phone: sqliteText("phone"),
  emailContact: sqliteText("email_contact"),
  receiptFooter: sqliteText("receipt_footer").default("Thank you for your business!"),
});

export const insertProductSchema = createInsertSchema(products).omit({ id: true, createdAt: true });
export const insertProductSizeSchema = createInsertSchema(productSizes).omit({ id: true });
export const insertProductModifierSchema = createInsertSchema(productModifiers).omit({ id: true });
export const insertPendingOrderSchema = createInsertSchema(pendingOrders).omit({ id: true, createdAt: true });
export const insertSaleSchema = createInsertSchema(sales).omit({ id: true, createdAt: true });
export const insertUserSettingSchema = createInsertSchema(userSettings).omit({ id: true });

export const inventoryAdjustmentSchema = z.object({
  productId: z.number(),
  quantity: z.number(),
  reason: z.enum(["sale", "adjustment", "received", "loss"]),
  notes: z.string().optional(),
});

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
