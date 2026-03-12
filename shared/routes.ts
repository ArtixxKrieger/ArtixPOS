import { z } from "zod";
import { 
  insertProductSchema, 
  insertIngredientSchema,
  insertRecipeSchema,
  insertPendingOrderSchema, 
  insertSaleSchema, 
  insertUserSettingSchema,
  products,
  pendingOrders,
  sales,
  userSettings,
  ingredients,
  recipes
} from "./schema";

export const errorSchemas = {
  validation: z.object({
    message: z.string(),
    field: z.string().optional(),
  }),
  notFound: z.object({
    message: z.string(),
  }),
  internal: z.object({
    message: z.string(),
  }),
};

export const api = {
  products: {
    list: {
      method: "GET" as const,
      path: "/api/products" as const,
      responses: {
        200: z.array(z.custom<typeof products.$inferSelect>()),
      }
    },
    get: {
      method: "GET" as const,
      path: "/api/products/:id" as const,
      responses: {
        200: z.custom<typeof products.$inferSelect>(),
        404: errorSchemas.notFound,
      }
    },
    create: {
      method: "POST" as const,
      path: "/api/products" as const,
      input: insertProductSchema,
      responses: {
        201: z.custom<typeof products.$inferSelect>(),
        400: errorSchemas.validation,
      }
    },
    update: {
      method: "PUT" as const,
      path: "/api/products/:id" as const,
      input: insertProductSchema.partial(),
      responses: {
        200: z.custom<typeof products.$inferSelect>(),
        404: errorSchemas.notFound,
        400: errorSchemas.validation,
      }
    },
    delete: {
      method: "DELETE" as const,
      path: "/api/products/:id" as const,
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
      }
    }
  },
  pendingOrders: {
    list: {
      method: "GET" as const,
      path: "/api/pending-orders" as const,
      responses: {
        200: z.array(z.custom<typeof pendingOrders.$inferSelect>()),
      }
    },
    create: {
      method: "POST" as const,
      path: "/api/pending-orders" as const,
      input: insertPendingOrderSchema,
      responses: {
        201: z.custom<typeof pendingOrders.$inferSelect>(),
        400: errorSchemas.validation,
      }
    },
    update: {
      method: "PUT" as const,
      path: "/api/pending-orders/:id" as const,
      input: insertPendingOrderSchema.partial(),
      responses: {
        200: z.custom<typeof pendingOrders.$inferSelect>(),
        404: errorSchemas.notFound,
        400: errorSchemas.validation,
      }
    },
    delete: {
      method: "DELETE" as const,
      path: "/api/pending-orders/:id" as const,
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
      }
    }
  },
  sales: {
    list: {
      method: "GET" as const,
      path: "/api/sales" as const,
      responses: {
        200: z.array(z.custom<typeof sales.$inferSelect>()),
      }
    },
    create: {
      method: "POST" as const,
      path: "/api/sales" as const,
      input: insertSaleSchema,
      responses: {
        201: z.custom<typeof sales.$inferSelect>(),
        400: errorSchemas.validation,
      }
    }
  },
  settings: {
    get: {
      method: "GET" as const,
      path: "/api/settings" as const,
      responses: {
        200: z.custom<typeof userSettings.$inferSelect>(),
        404: errorSchemas.notFound,
      }
    },
    update: {
      method: "PUT" as const,
      path: "/api/settings" as const,
      input: insertUserSettingSchema.partial(),
      responses: {
        200: z.custom<typeof userSettings.$inferSelect>(),
        400: errorSchemas.validation,
      }
    }
  }
};

export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}
