import swaggerJsdoc from "swagger-jsdoc";
import swaggerUi from "swagger-ui-express";
import type { Express } from "express";

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "ArtixPOS API",
      version: "1.0.0",
      description:
        "Business OS & Point of Sale REST API. All endpoints require JWT authentication " +
        "via the `auth_token` cookie (web) or `Authorization: Bearer <token>` header (mobile/API).",
      contact: { name: "ArtixPOS Support" },
    },
    servers: [{ url: "/", description: "Current server" }],
    components: {
      securitySchemes: {
        cookieAuth: { type: "apiKey", in: "cookie", name: "auth_token" },
        bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
      },
      schemas: {
        Error: {
          type: "object",
          properties: {
            message: { type: "string", example: "Unauthorized" },
          },
        },
        HealthResponse: {
          type: "object",
          properties: {
            status: { type: "string", enum: ["ok", "degraded", "down"] },
            uptime: { type: "number" },
            ts: { type: "string", format: "date-time" },
            services: {
              type: "object",
              properties: {
                supabase: { type: "object", properties: { status: { type: "string" }, latencyMs: { type: "number" } } },
                redis: { type: "object", properties: { status: { type: "string" }, latencyMs: { type: "number" } } },
              },
            },
          },
        },
      },
    },
    security: [{ cookieAuth: [] }, { bearerAuth: [] }],
    tags: [
      { name: "Health", description: "Service health and metrics" },
      { name: "Auth", description: "Authentication — register, login, logout, OAuth" },
      { name: "Products", description: "Product catalog management" },
      { name: "Sales", description: "Sales and transactions" },
      { name: "Orders", description: "Pending orders and kitchen tickets" },
      { name: "Customers", description: "Customer CRM and loyalty" },
      { name: "Inventory", description: "Stock, ingredients, and purchase orders" },
      { name: "Expenses", description: "Expense tracking" },
      { name: "Staff", description: "Staff, shifts, and payroll" },
      { name: "Appointments", description: "Service appointments and rooms" },
      { name: "Analytics", description: "Reports and business analytics" },
      { name: "Admin", description: "Tenant and subscription management" },
    ],
    paths: {
      "/api/health": {
        get: {
          tags: ["Health"],
          summary: "Health check",
          description: "Returns the health status of all services (database, Redis).",
          security: [],
          responses: {
            "200": {
              description: "All services healthy",
              content: { "application/json": { schema: { $ref: "#/components/schemas/HealthResponse" } } },
            },
            "503": { description: "Database unreachable" },
          },
        },
      },
      "/api/auth/me": {
        get: {
          tags: ["Auth"],
          summary: "Get current user",
          description: "Returns the authenticated user's profile, or null if not logged in.",
          responses: {
            "200": { description: "User profile or null" },
            "401": { description: "Not authenticated", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          },
        },
      },
      "/api/auth/register": {
        post: {
          tags: ["Auth"],
          summary: "Register a new account",
          security: [],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["name", "email", "password"],
                  properties: {
                    name: { type: "string" },
                    email: { type: "string", format: "email" },
                    password: { type: "string", minLength: 8 },
                    storeName: { type: "string" },
                    inviteToken: { type: "string" },
                  },
                },
              },
            },
          },
          responses: {
            "200": { description: "Registration successful, JWT set in cookie" },
            "400": { description: "Validation error or email taken" },
          },
        },
      },
      "/api/auth/local-login": {
        post: {
          tags: ["Auth"],
          summary: "Login with email and password",
          security: [],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["email", "password"],
                  properties: {
                    email: { type: "string", format: "email" },
                    password: { type: "string" },
                    rememberMe: { type: "boolean" },
                  },
                },
              },
            },
          },
          responses: {
            "200": { description: "Login successful, JWT set in cookie" },
            "400": { description: "Missing credentials" },
            "401": { description: "Invalid credentials" },
            "429": { description: "Too many failed attempts — IP blocked" },
          },
        },
      },
      "/api/auth/logout": {
        post: {
          tags: ["Auth"],
          summary: "Logout current session",
          responses: {
            "200": { description: "Logged out, auth cookie cleared" },
          },
        },
      },
      "/api/products": {
        get: {
          tags: ["Products"],
          summary: "List all products",
          parameters: [{ name: "branchId", in: "query", schema: { type: "integer" } }],
          responses: {
            "200": { description: "Array of products" },
            "401": { $ref: "#/components/schemas/Error" },
          },
        },
        post: {
          tags: ["Products"],
          summary: "Create a product",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["name", "price"],
                  properties: {
                    name: { type: "string" },
                    price: { type: "string" },
                    category: { type: "string" },
                    sku: { type: "string" },
                    trackStock: { type: "boolean" },
                    stock: { type: "integer" },
                  },
                },
              },
            },
          },
          responses: {
            "200": { description: "Created product" },
            "400": { description: "Validation error" },
            "401": { $ref: "#/components/schemas/Error" },
          },
        },
      },
      "/api/sales": {
        get: {
          tags: ["Sales"],
          summary: "List sales",
          parameters: [
            { name: "from", in: "query", schema: { type: "string", format: "date" } },
            { name: "to", in: "query", schema: { type: "string", format: "date" } },
            { name: "branchId", in: "query", schema: { type: "integer" } },
          ],
          responses: { "200": { description: "Array of sales" } },
        },
        post: {
          tags: ["Sales"],
          summary: "Record a sale",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["items", "subtotal", "total"],
                  properties: {
                    items: { type: "array", items: { type: "object" } },
                    subtotal: { type: "string" },
                    total: { type: "string" },
                    paymentMethod: { type: "string", enum: ["cash", "card", "gcash", "maya", "other"] },
                    customerId: { type: "integer" },
                  },
                },
              },
            },
          },
          responses: { "200": { description: "Recorded sale" } },
        },
      },
      "/api/customers": {
        get: { tags: ["Customers"], summary: "List customers", responses: { "200": { description: "Array of customers" } } },
        post: {
          tags: ["Customers"],
          summary: "Create a customer",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { type: "object", required: ["name"], properties: { name: { type: "string" }, phone: { type: "string" }, email: { type: "string" } } },
              },
            },
          },
          responses: { "200": { description: "Created customer" } },
        },
      },
      "/api/metrics": {
        get: {
          tags: ["Health"],
          summary: "Request metrics and circuit breaker states",
          description: "Optionally protected by METRICS_TOKEN env var.",
          responses: { "200": { description: "Metrics snapshot" }, "401": { description: "Invalid token" } },
        },
      },
    },
  },
  apis: [],
};

export function setupSwagger(app: Express): void {
  const spec = swaggerJsdoc(options);
  app.use("/api/docs", swaggerUi.serve);

  app.get("/api/docs", swaggerUi.setup(spec as any, {
    customCss: ".swagger-ui .topbar { display: none }",
    customSiteTitle: "ArtixPOS API Docs",
    swaggerOptions: { persistAuthorization: true },
  }));
  app.get("/api/docs.json", (_req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.json(spec);
  });
  console.log("[swagger] ✓ API docs at /api/docs");
}
