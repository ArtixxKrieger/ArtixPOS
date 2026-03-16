import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import * as schema from "@shared/schema";

// Use Turso for production, local SQLite for development
const client = createClient({
  url: process.env.TURSO_DATABASE_URL || "file:local.db",
  authToken: process.env.TURSO_AUTH_TOKEN,
});

export const db = drizzle(client, { schema });

export async function seed() {
  const { userSettings } = schema;

  // Seed user settings if none exist
  const existingSettings = await db.select().from(userSettings).limit(1);
  if (existingSettings.length === 0) {
    console.log("Seeding initial settings...");
    await db.insert(userSettings).values({
      storeName: "Café Bara",
      currency: "₱",
      taxRate: "0"
    });
  }
}