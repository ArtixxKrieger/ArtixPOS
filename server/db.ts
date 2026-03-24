import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import * as schema from "@shared/schema";

function getDbUrl(): string {
  if (process.env.TURSO_DATABASE_URL) {
    return process.env.TURSO_DATABASE_URL;
  }
  if (process.env.VERCEL === "1") {
    console.warn(
      "⚠️  No TURSO_DATABASE_URL set. Using in-memory SQLite on Vercel — data will NOT persist.",
    );
    return "file::memory:?cache=shared";
  }
  return "file:local.db";
}

const client = createClient({
  url: getDbUrl(),
  authToken: process.env.TURSO_AUTH_TOKEN,
});

export const db = drizzle(client, { schema });
