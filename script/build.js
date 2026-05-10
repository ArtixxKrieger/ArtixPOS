#!/usr/bin/env node
import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

console.log("\n Building full-stack application for production...\n");

// Heavy packages that should stay as node_modules (installed by Vercel).
// Bundling them bloats the output and makes cold starts slower.
const HEAVY_EXTERNALS = [
  // dev-only tools
  "*.node",
  "vite",
  "@vitejs/plugin-react",
  "@replit/vite-plugin-cartographer",
  "@replit/vite-plugin-runtime-error-modal",
  "@replit/vite-plugin-dev-banner",
  "drizzle-kit",
  "tsx",
  // large runtime packages — kept as node_modules externals
  "drizzle-orm",
  "drizzle-zod",
  "pg",
  "pg-native",
  "connect-pg-simple",
  "connect-sqlite3",
  "better-sqlite3",
  "@libsql/client",
  "xlsx",
  "date-fns",
  "nodemailer",
  "multer",
  "pdf-parse",
  "jspdf",
  "jspdf-autotable",
  "groq-sdk",
  "openai",
  "@google/generative-ai",
  "stripe",
  "passport-google-oauth20",
  "passport-facebook",
  "framer-motion",
  "recharts",
  "pino",
  "pino-pretty",
  "helmet",
  "compression",
  "@upstash/redis",
  "@upstash/ratelimit",
  "express-session",
  "memorystore",
];

try {
  const distDir = path.join(projectRoot, "dist");
  if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
  }

  // 0. Push database schema changes to production database
  console.log("[0/3] Syncing database schema...");
  try {
    execSync("npx drizzle-kit push --force", {
      stdio: ["ignore", "pipe", "pipe"],
      cwd: projectRoot,
    });
    console.log("✓ Database schema up to date\n");
  } catch (err) {
    console.warn("⚠  db:push failed (continuing build):", err.stderr?.toString().trim() || err.message, "\n");
  }

  // 1. Build frontend with Vite → dist/public/
  console.log("[1/3] Building frontend with Vite...");
  try {
    execSync("npx vite build", { stdio: "inherit", cwd: projectRoot });
    console.log("✓ Frontend built to dist/public\n");
  } catch (err) {
    console.warn("⚠  Vite build failed:", err.message, "\n");
  }

  // 2. Bundle server — only small core packages inlined, heavy deps stay external
  console.log("[2/3] Bundling server into dist/index.cjs...");
  const externalsArgs = HEAVY_EXTERNALS.map((e) => `--external:${e}`).join(" ");

  execSync(
    [
      "npx esbuild server/index.ts",
      "--bundle",
      "--platform=node",
      "--format=cjs",
      "--target=node18",
      "--outfile=dist/index.cjs",
      "--minify",
      externalsArgs,
      "--tsconfig=tsconfig.json",
    ].join(" "),
    { stdio: "inherit", cwd: projectRoot },
  );
  console.log("✓ Server bundled to dist/index.cjs\n");

  // Copy migrations if present
  const migrationsSource = path.join(projectRoot, "migrations");
  const migrationsTarget = path.join(distDir, "migrations");
  if (fs.existsSync(migrationsSource)) {
    try {
      if (fs.existsSync(migrationsTarget)) {
        fs.rmSync(migrationsTarget, { recursive: true, force: true });
      }
      const copyDir = (src, dest) => {
        if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
        fs.readdirSync(src).forEach((file) => {
          const srcPath = path.join(src, file);
          const destPath = path.join(dest, file);
          if (fs.lstatSync(srcPath).isDirectory()) copyDir(srcPath, destPath);
          else fs.copyFileSync(srcPath, destPath);
        });
      };
      copyDir(migrationsSource, migrationsTarget);
      console.log("✓ Migrations copied");
    } catch (err) {
      console.warn("⚠  Could not copy migrations:", err.message);
    }
  }

  // Summary
  const publicOk = fs.existsSync(path.join(distDir, "public"));
  const cjsOk    = fs.existsSync(path.join(distDir, "index.cjs"));
  const cjsSize  = cjsOk
    ? (fs.statSync(path.join(distDir, "index.cjs")).size / 1024).toFixed(0) + " KB"
    : "—";

  console.log("\n Build complete!");
  console.log(`  Frontend  : dist/public  (${publicOk ? "✓" : "MISSING"})`);
  console.log(`  Server    : dist/index.cjs  ${cjsSize}  (${cjsOk ? "✓" : "MISSING"})`);
  console.log("\n  Vercel    : points to dist/index.cjs\n");
} catch (error) {
  console.error("\n Build failed:", error.message);
  process.exit(1);
}
