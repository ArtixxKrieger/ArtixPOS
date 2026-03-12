import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import * as schema from "@shared/schema";
import path from "path";
import { fileURLToPath } from "url";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.resolve(__dirname, "data.db");
export const sqlite = new Database(dbPath);
export const db = drizzle(sqlite, { schema });

// Initialize database schema
export async function initializeDatabase() {
  try {
    // Enable foreign keys
    sqlite.pragma("foreign_keys = ON");
    
    // Create tables if they don't exist by running the schema
    // This is a simple approach - just try to query each table, if it fails, create it
    const tables = [
      `CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        price TEXT NOT NULL,
        category TEXT DEFAULT 'General',
        stock INTEGER DEFAULT 0,
        min_stock INTEGER DEFAULT 10,
        sku TEXT,
        has_sizes INTEGER DEFAULT 0,
        has_modifiers INTEGER DEFAULT 0,
        sizes TEXT DEFAULT '[]',
        modifiers TEXT DEFAULT '[]',
        created_at INTEGER
      )`,
      `CREATE TABLE IF NOT EXISTS user_settings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        store_name TEXT DEFAULT 'My Store',
        currency TEXT DEFAULT '₱',
        tax_rate TEXT DEFAULT '0',
        address TEXT,
        phone TEXT,
        email_contact TEXT,
        receipt_footer TEXT DEFAULT 'Thank you for your business!'
      )`,
      `CREATE TABLE IF NOT EXISTS pending_orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        items TEXT NOT NULL,
        subtotal TEXT NOT NULL,
        tax TEXT DEFAULT '0',
        discount TEXT DEFAULT '0',
        total TEXT NOT NULL,
        payment_method TEXT DEFAULT 'cash',
        payment_amount TEXT DEFAULT '0',
        change_amount TEXT DEFAULT '0',
        status TEXT DEFAULT 'unpaid',
        customer_name TEXT,
        notes TEXT,
        created_at INTEGER
      )`,
      `CREATE TABLE IF NOT EXISTS sales (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        items TEXT NOT NULL,
        subtotal TEXT NOT NULL,
        tax TEXT DEFAULT '0',
        discount TEXT DEFAULT '0',
        total TEXT NOT NULL,
        payment_method TEXT DEFAULT 'cash',
        payment_amount TEXT DEFAULT '0',
        change_amount TEXT DEFAULT '0',
        customer_name TEXT,
        notes TEXT,
        created_at INTEGER
      )`,
      `CREATE TABLE IF NOT EXISTS ingredients (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        unit TEXT NOT NULL,
        current_stock TEXT DEFAULT '0',
        min_stock TEXT DEFAULT '0',
        cost TEXT DEFAULT '0',
        created_at INTEGER
      )`,
      `CREATE TABLE IF NOT EXISTS recipes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_id INTEGER NOT NULL,
        ingredient_id INTEGER NOT NULL,
        quantity TEXT NOT NULL,
        created_at INTEGER,
        FOREIGN KEY (product_id) REFERENCES products(id),
        FOREIGN KEY (ingredient_id) REFERENCES ingredients(id)
      )`
    ];

    for (const sql of tables) {
      sqlite.exec(sql);
    }
    
    console.log("✅ Database schema initialized");
  } catch (error) {
    console.error("Database initialization error:", error);
    throw error;
  }
}

// Auto-seed function
export async function seed() {
  try {
    const { userSettings } = schema;
    const existingSettings = await db.select().from(userSettings).limit(1);
    if (existingSettings.length === 0) {
      console.log("Seeding initial settings...");
      await db.insert(userSettings).values({
        storeName: "Café Bara",
        currency: "₱",
        taxRate: "0"
      });
    }
  } catch (error) {
    console.log("Seed skipped or completed:", (error as Error).message);
  }
}
