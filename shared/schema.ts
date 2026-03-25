import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ─── Users ────────────────────────────────────────────────────────────────────

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email"),
  name: text("name"),
  avatar: text("avatar"),
  provider: text("provider").notNull(),
  providerId: text("provider_id").notNull(),
  createdAt: text("created_at").$defaultFn(() => new Date().toISOString()),
});

// ─── Table Definitions ────────────────────────────────────────────────────────

export const products = sqliteTable("products", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id").notNull().references(() => users.id),
  name: text("name").notNull(),
  price: text("price").notNull().default("0"),
  category: text("category"),
  hasSizes: integer("has_sizes", { mode: "boolean" }).default(false),
  hasModifiers: integer("has_modifiers", { mode: "boolean" }).default(false),
  sizes: text("sizes", { mode: "json" }).$type<{ name: string; price: string }[]>(),
  modifiers: text("modifiers", { mode: "json" }).$type<{ name: string; price: string }[]>(),
  createdAt: text("created_at").$defaultFn(() => new Date().toISOString()),
});

export const productSizes = sqliteTable("product_sizes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  productId: integer("product_id").notNull(),
  sizeName: text("size_name").notNull(),
  price: text("price").notNull(),
});

export const productModifiers = sqliteTable("product_modifiers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  productId: integer("product_id").notNull(),
  modifierName: text("modifier_name").notNull(),
  price: text("price").notNull(),
});

export const pendingOrders = sqliteTable("pending_orders", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id").notNull().references(() => users.id),
  items: text("items", { mode: "json" }).notNull().$type<any[]>(),
  subtotal: text("subtotal").notNull(),
  tax: text("tax").default("0"),
  discount: text("discount").default("0"),
  total: text("total").notNull(),
  paymentMethod: text("payment_method").default("cash"),
  paymentAmount: text("payment_amount"),
  changeAmount: text("change_amount"),
  status: text("status").default("unpaid"),
  notes: text("notes"),
  createdAt: text("created_at").$defaultFn(() => new Date().toISOString()),
});

export const sales = sqliteTable("sales", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id").notNull().references(() => users.id),
  items: text("items", { mode: "json" }).notNull().$type<any[]>(),
  subtotal: text("subtotal").notNull(),
  tax: text("tax").default("0"),
  discount: text("discount").default("0"),
  total: text("total").notNull(),
  paymentMethod: text("payment_method").default("cash"),
  paymentAmount: text("payment_amount"),
  changeAmount: text("change_amount"),
  notes: text("notes"),
  createdAt: text("created_at").$defaultFn(() => new Date().toISOString()),
});

export const userSettings = sqliteTable("user_settings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id").notNull().unique().references(() => users.id),
  storeName: text("store_name"),
  currency: text("currency"),
  taxRate: text("tax_rate"),
  address: text("address"),
  phone: text("phone"),
  emailContact: text("email_contact"),
  receiptFooter: text("receipt_footer"),
  timezone: text("timezone"),
});

// ─── Insert Schemas ───────────────────────────────────────────────────────────

// Note: createInsertSchema().extend() works fine, but .omit().extend() triggers
// a type-level incompatibility between drizzle-zod 0.7 and Zod v4 (3.25+).
// Schemas that need .omit() are defined as plain z.object() instead — same
// runtime behaviour, no type errors.

export const insertUserSchema = createInsertSchema(users).extend({
  email: z.string().optional().nullable(),
  name: z.string().optional().nullable(),
  avatar: z.string().optional().nullable(),
});

export const insertProductSchema = z.object({
  name: z.string().min(1),
  price: z.string().min(1),
  category: z.string().optional().nullable(),
  sizes: z.array(z.object({ name: z.string(), price: z.string() })).optional().nullable(),
  modifiers: z.array(z.object({ name: z.string(), price: z.string() })).optional().nullable(),
  hasSizes: z.boolean().optional().nullable(),
  hasModifiers: z.boolean().optional().nullable(),
});

export const insertProductSizeSchema = createInsertSchema(productSizes)
  .extend({
    productId: z.number(),
    sizeName: z.string().min(1),
    price: z.string().min(1),
  });

export const insertProductModifierSchema = createInsertSchema(productModifiers)
  .extend({
    productId: z.number(),
    modifierName: z.string().min(1),
    price: z.string().min(1),
  });

export const insertPendingOrderSchema = z.object({
  items: z.array(z.any()),
  subtotal: z.string(),
  tax: z.string().optional().nullable(),
  discount: z.string().optional().nullable(),
  total: z.string(),
  paymentMethod: z.string().optional().nullable(),
  paymentAmount: z.string().optional().nullable(),
  changeAmount: z.string().optional().nullable(),
  status: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export const insertSaleSchema = z.object({
  items: z.array(z.any()),
  subtotal: z.string(),
  tax: z.string().optional().nullable(),
  discount: z.string().optional().nullable(),
  total: z.string(),
  paymentMethod: z.string().optional().nullable(),
  paymentAmount: z.string().optional().nullable(),
  changeAmount: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export const insertUserSettingSchema = z.object({
  storeName: z.string().optional().nullable(),
  currency: z.string().optional().nullable(),
  taxRate: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  emailContact: z.string().optional().nullable(),
  receiptFooter: z.string().optional().nullable(),
  timezone: z.string().optional().nullable(),
});

// ─── Types ────────────────────────────────────────────────────────────────────

export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

export type Product = typeof products.$inferSelect;
export type InsertProduct = z.infer<typeof insertProductSchema>;

export type ProductSize = typeof productSizes.$inferSelect;
export type InsertProductSize = z.infer<typeof insertProductSizeSchema>;

export type ProductModifier = typeof productModifiers.$inferSelect;
export type InsertProductModifier = z.infer<typeof insertProductModifierSchema>;

export type PendingOrder = typeof pendingOrders.$inferSelect;
export type InsertPendingOrder = z.infer<typeof insertPendingOrderSchema>;

export type Sale = typeof sales.$inferSelect;
export type InsertSale = z.infer<typeof insertSaleSchema>;

export type UserSetting = typeof userSettings.$inferSelect;
export type InsertUserSetting = z.infer<typeof insertUserSettingSchema>;
