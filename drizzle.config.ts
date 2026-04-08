import { defineConfig } from "drizzle-kit";

export default defineConfig({
  out: "./migrations",
  schema: "./shared/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL || process.env.SUPABASE_POOLER_URL!,
    ssl: (process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("localhost"))
      ? "allow"
      : false,
  },
});
