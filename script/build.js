#!/usr/bin/env node
import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

console.log("\n Building full-stack application for production...\n");

try {
  const distDir = path.join(projectRoot, "dist");
  if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
  }

  // 1. Build frontend with Vite → dist/public/
  console.log("[1/2] Building frontend with Vite...");
  try {
    execSync("npx vite build", { stdio: "inherit", cwd: projectRoot });
    console.log("✓ Frontend built to dist/public\n");
  } catch (err) {
    console.warn("⚠  Vite build failed:", err.message, "\n");
  }

  // 2. Bundle entire server into a single self-contained CJS file.
  //    - --bundle inlines all local imports AND node_modules into one file
  //    - *.node files (native addons) cannot be inlined — kept external
  //    - vite / replit plugins are dev-only, never imported in production paths
  //    - .wasm files are inlined as base64 so no missing file at runtime
  console.log("[2/2] Bundling server into dist/index.cjs...");
  const externals = [
    "*.node",               // native binary addons
    "vite",                 // dev-only
    "@vitejs/plugin-react", // dev-only
    "@replit/vite-plugin-cartographer",         // dev-only
    "@replit/vite-plugin-runtime-error-modal",  // dev-only
    "@replit/vite-plugin-dev-banner",           // dev-only
    "drizzle-kit",          // dev-only CLI tool
    "tsx",                  // dev-only runner
  ].map((e) => `--external:${e}`).join(" ");

  execSync(
    [
      "npx esbuild server/index.ts",
      "--bundle",
      "--platform=node",
      "--format=cjs",
      "--target=node18",
      "--outfile=dist/index.cjs",
      "--loader:.wasm=base64",  // inline WASM so no missing files at runtime
      externals,
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
  console.log("\n  Local test : NODE_ENV=production node dist/index.cjs");
  console.log("  Vercel     : points to dist/index.cjs (self-contained bundle)\n");
} catch (error) {
  console.error("\n Build failed:", error.message);
  process.exit(1);
}
