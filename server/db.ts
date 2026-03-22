import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import * as schema from "@shared/schema";

// On Vercel (or any serverless/read-only environment):
//   - Set TURSO_DATABASE_URL + TURSO_AUTH_TOKEN to use a hosted Turso database (recommended)
//   - Without those env vars the app falls back to a temp in-memory DB that resets on each cold start
// In local development:
//   - Falls back to a local SQLite file (./local.db)
function getDbUrl(): string {
  if (process.env.TURSO_DATABASE_URL) {
    return process.env.TURSO_DATABASE_URL;
  }
  // Vercel Lambda filesystem is read-only except for /tmp
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

export async function seed() {
  try {
    const { userSettings } = schema;
    const existingSettings = await db.select().from(userSettings).limit(1);
    if (existingSettings.length === 0) {
      console.log("Seeding initial settings...");
      await db.insert(userSettings).values({
        storeName: "Café Bara",
        currency: "₱",
        taxRate: "0",
      });
      console.log("Seeding complete");
    }
  } catch (error) {
    console.error("Seed error (non-fatal):", error instanceof Error ? error.message : error);
  }
}
