// Insert schemas - fix for drizzle-zod
export const insertProductSchema = createInsertSchema(products, {
  name: z.string().min(1),
  price: z.string().min(1),
  category: z.string().optional(),
  sizes: z.array(z.object({ name: z.string(), price: z.string() })).optional(),
  modifiers: z.array(z.object({ name: z.string(), price: z.string() })).optional(),
  hasSizes: z.boolean().optional(),
  hasModifiers: z.boolean().optional()
}).omit({ id: true, createdAt: true });

export const insertProductSizeSchema = createInsertSchema(productSizes, {
  productId: z.number(),
  sizeName: z.string().min(1),
  price: z.string().min(1)
}).omit({ id: true });

export const insertProductModifierSchema = createInsertSchema(productModifiers, {
  productId: z.number(),
  modifierName: z.string().min(1),
  price: z.string().min(1)
}).omit({ id: true });

export const insertPendingOrderSchema = createInsertSchema(pendingOrders, {
  items: z.array(z.any()),
  subtotal: z.string(),
  tax: z.string().optional(),
  discount: z.string().optional(),
  total: z.string(),
  paymentMethod: z.string().optional(),
  paymentAmount: z.string().optional(),
  changeAmount: z.string().optional(),
  status: z.string().optional(),
  customerName: z.string().optional().nullable(),
  notes: z.string().optional().nullable()
}).omit({ id: true, createdAt: true });

export const insertSaleSchema = createInsertSchema(sales, {
  items: z.array(z.any()),
  subtotal: z.string(),
  tax: z.string().optional(),
  discount: z.string().optional(),
  total: z.string(),
  paymentMethod: z.string().optional(),
  paymentAmount: z.string().optional(),
  changeAmount: z.string().optional(),
  customerName: z.string().optional().nullable(),
  notes: z.string().optional().nullable()
}).omit({ id: true, createdAt: true });

export const insertUserSettingSchema = createInsertSchema(userSettings, {
  storeName: z.string().optional(),
  currency: z.string().optional(),
  taxRate: z.string().optional(),
  address: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  emailContact: z.string().optional().nullable(),
  receiptFooter: z.string().optional().nullable()
}).omit({ id: true });