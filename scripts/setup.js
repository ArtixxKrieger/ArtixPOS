#!/usr/bin/env node
/**
 * ArtixPOS — first-time setup script
 * Run: node scripts/setup.js
 *
 * What it does:
 *   1. Copies .env.example → .env (skips if .env already exists)
 *   2. Generates a secure SESSION_SECRET and writes it into .env
 *   3. Prints next steps
 */

import { existsSync, readFileSync, writeFileSync, copyFileSync } from "fs";
import { randomBytes } from "crypto";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const envExample = resolve(root, ".env.example");
const envFile = resolve(root, ".env");

const RESET = "\x1b[0m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";
const RED = "\x1b[31m";
const BOLD = "\x1b[1m";

function log(color, prefix, msg) {
  console.log(`${color}${prefix}${RESET} ${msg}`);
}

console.log(`\n${BOLD}${CYAN}ArtixPOS — Setup${RESET}\n`);

// ── Step 1: Copy .env.example → .env ─────────────────────────────────────────
if (existsSync(envFile)) {
  log(YELLOW, "[skip]", ".env already exists — leaving it untouched.");
} else {
  if (!existsSync(envExample)) {
    log(RED, "[error]", ".env.example not found. Please restore it from the repository.");
    process.exit(1);
  }
  copyFileSync(envExample, envFile);
  log(GREEN, "[done]", "Created .env from .env.example");
}

// ── Step 2: Generate SESSION_SECRET if placeholder ────────────────────────────
let env = readFileSync(envFile, "utf8");
const secretPlaceholder = /SESSION_SECRET=replace-with-a-64-character.*/;
const secretEmpty = /SESSION_SECRET=\s*$/m;
const needsSecret = secretPlaceholder.test(env) || secretEmpty.test(env);

if (needsSecret) {
  const secret = randomBytes(64).toString("hex");
  env = env
    .replace(secretPlaceholder, `SESSION_SECRET=${secret}`)
    .replace(secretEmpty, `SESSION_SECRET=${secret}`);
  writeFileSync(envFile, env, "utf8");
  log(GREEN, "[done]", "Generated a secure SESSION_SECRET in .env");
} else {
  log(YELLOW, "[skip]", "SESSION_SECRET already set in .env");
}

// ── Step 3: Print next steps ──────────────────────────────────────────────────
console.log(`
${BOLD}Next steps:${RESET}

  ${CYAN}1.${RESET} Set your ${BOLD}DATABASE_URL${RESET} in ${BOLD}.env${RESET}
       Local PostgreSQL example:
         ${YELLOW}DATABASE_URL=postgres://artixpos:password@localhost:5432/artixpos${RESET}

       Or use a hosted DB (Neon, Supabase, Railway):
         ${YELLOW}DATABASE_URL=postgres://user:pass@host:5432/dbname?sslmode=require${RESET}

  ${CYAN}2.${RESET} Push the database schema:
       ${YELLOW}npm run db:push${RESET}

  ${CYAN}3.${RESET} Start the dev server:
       ${YELLOW}npm run dev${RESET}
       Then open ${BOLD}http://localhost:5000${RESET}

  ${CYAN}4.${RESET} (Optional) Add AI keys, OAuth, email, etc. to .env
       See .env.example for all available options.

${GREEN}Setup complete!${RESET}
`);
