#!/usr/bin/env node
/**
 * ArtixPOS — first-time setup script
 * Run:  node scripts/setup.js
 *
 * What it does:
 *   1. Checks Node.js version (needs v18+)
 *   2. Copies .env.example → .env  (skips if already exists)
 *   3. Generates a secure SESSION_SECRET and writes it into .env
 *   4. Checks whether DATABASE_URL has been set — shows instructions if not
 */

import { existsSync, readFileSync, writeFileSync, copyFileSync } from "fs";
import { randomBytes } from "crypto";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const envExample = resolve(root, ".env.example");
const envFile = resolve(root, ".env");

const RESET  = "\x1b[0m";
const GREEN  = "\x1b[32m";
const YELLOW = "\x1b[33m";
const CYAN   = "\x1b[36m";
const RED    = "\x1b[31m";
const BOLD   = "\x1b[1m";
const DIM    = "\x1b[2m";

const ok   = (msg) => console.log(`${GREEN} ✓ ${RESET}${msg}`);
const warn = (msg) => console.log(`${YELLOW} ! ${RESET}${msg}`);
const fail = (msg) => console.log(`${RED} ✗ ${RESET}${msg}`);
const info = (msg) => console.log(`${DIM}   ${msg}${RESET}`);
const step = (msg) => console.log(`\n${BOLD}${CYAN}▶ ${msg}${RESET}`);

console.log(`\n${BOLD}${CYAN}╔══════════════════════════════════╗`);
console.log(`║   ArtixPOS — First-time Setup    ║`);
console.log(`╚══════════════════════════════════╝${RESET}\n`);

let hasErrors = false;

// ── Step 1: Node.js version check ────────────────────────────────────────────
step("Checking Node.js version...");
const [major] = process.versions.node.split(".").map(Number);
if (major < 18) {
  fail(`Node.js ${process.versions.node} is too old. ArtixPOS needs Node 18 or later.`);
  info("Download the latest LTS from: https://nodejs.org");
  process.exit(1);
} else {
  ok(`Node.js ${process.versions.node} — OK`);
}

// ── Step 2: Copy .env.example → .env ─────────────────────────────────────────
step("Setting up .env file...");
if (existsSync(envFile)) {
  warn(".env already exists — leaving it untouched.");
} else {
  if (!existsSync(envExample)) {
    fail(".env.example not found. Please restore it from the repository.");
    process.exit(1);
  }
  copyFileSync(envExample, envFile);
  ok("Created .env from .env.example");
}

// ── Step 3: Generate SESSION_SECRET if missing ────────────────────────────────
step("Checking SESSION_SECRET...");
let env = readFileSync(envFile, "utf8");
const secretPlaceholder = /SESSION_SECRET=replace-with-a-64-character[^\n]*/;
const secretEmpty       = /^SESSION_SECRET=\s*$/m;
const secretMissing     = secretPlaceholder.test(env) || secretEmpty.test(env);

if (secretMissing) {
  const secret = randomBytes(64).toString("hex");
  env = env
    .replace(secretPlaceholder, `SESSION_SECRET=${secret}`)
    .replace(secretEmpty,       `SESSION_SECRET=${secret}`);
  writeFileSync(envFile, env, "utf8");
  ok("Generated a secure SESSION_SECRET and saved it to .env");
} else {
  ok("SESSION_SECRET is already set.");
}

// ── Step 4: Check DATABASE_URL ────────────────────────────────────────────────
step("Checking DATABASE_URL...");

const dbLineMatch = env.match(/^DATABASE_URL=(.*)$/m);
const dbValue     = dbLineMatch ? dbLineMatch[1].trim() : "";
const dbIsSet     = dbValue.length > 0 && !dbValue.startsWith("postgres://artixpos:yourpassword");

if (dbIsSet) {
  ok(`DATABASE_URL is set.`);
} else {
  warn("DATABASE_URL is not set yet — this is the only thing you need to do.");
  hasErrors = true;

  console.log(`
  ${BOLD}How to get a free database in 2 minutes:${RESET}

  ${CYAN}Option A — Neon (recommended, free tier, no card required):${RESET}
    1. Go to ${BOLD}https://neon.tech${RESET} and sign up (free)
    2. Create a new project → copy the connection string
    3. Paste it into ${BOLD}.env${RESET}:
       ${YELLOW}DATABASE_URL=postgres://user:pass@host.neon.tech/dbname?sslmode=require${RESET}

  ${CYAN}Option B — Local PostgreSQL:${RESET}
    1. Install PostgreSQL from ${BOLD}https://www.postgresql.org/download${RESET}
    2. Create a database:
       ${YELLOW}createdb artixpos${RESET}
    3. Set in ${BOLD}.env${RESET}:
       ${YELLOW}DATABASE_URL=postgres://postgres:yourpassword@localhost:5432/artixpos${RESET}

  ${CYAN}Option C — Supabase / Railway / Aiven${RESET} — all have free tiers.
  Just copy their PostgreSQL connection string into .env.
`);
}

// ── Step 5: Offer to run db:push if DATABASE_URL is ready ────────────────────
if (dbIsSet) {
  step("Running database schema push...");
  try {
    execSync("npm run db:push", { stdio: "inherit", cwd: root });
    ok("Database schema is up to date.");
  } catch {
    fail("db:push failed — check that DATABASE_URL is correct and the database is reachable.");
    hasErrors = true;
  }
}

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\n${BOLD}${"─".repeat(40)}${RESET}`);

if (hasErrors) {
  console.log(`\n${YELLOW}${BOLD}Almost there!${RESET} Fix the item above, then run:\n`);
  console.log(`  ${BOLD}node scripts/setup.js${RESET}  ← run again after setting DATABASE_URL`);
  console.log(`  ${BOLD}npm run dev${RESET}             ← start the app on http://localhost:5000\n`);
} else {
  console.log(`\n${GREEN}${BOLD}✓ Setup complete! You're ready to go.${RESET}\n`);
  console.log(`  ${BOLD}npm run dev${RESET}`);
  console.log(`  ${DIM}Then open http://localhost:5000${RESET}\n`);
}
