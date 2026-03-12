import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import * as schema from "@shared/schema";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.resolve(__dirname, "data.db");
export const sqlite = new Database(dbPath);
export const db = drizzle(sqlite, { schema });

// Auto-seed function
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