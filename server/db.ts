import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "@shared/schema";

const isServerless = !!process.env.VERCEL;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || process.env.SUPABASE_POOLER_URL || process.env.SUPABASE_DATABASE_URL,
  ssl: process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("localhost")
    ? { rejectUnauthorized: false }
    : false,

  // Serverless-optimised pool: keep it small so cold instances don't exhaust
  // Supabase's connection limit. Fluid Compute allows concurrent requests in a
  // single instance, so we allow up to 5 simultaneous DB connections there.
  max: isServerless ? 5 : 20,

  // Release idle connections quickly — serverless instances are short-lived.
  idleTimeoutMillis: isServerless ? 10_000 : 30_000,

  // Fail fast rather than queue requests indefinitely.
  connectionTimeoutMillis: 5_000,

  // Allow the Node process to exit when all connections are idle (Vercel
  // freezes the instance anyway, but this ensures clean teardown).
  allowExitOnIdle: isServerless,
});

export const db = drizzle(pool, { schema });
