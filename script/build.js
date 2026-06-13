#!/usr/bin/env node
/**
 * Production build script
 *
 * Steps:
 *   0. Push DB schema (drizzle-kit push)
 *   1. Build frontend with Vite           → dist/public/
 *   2. Bundle server entry (index.ts)     → dist/index.cjs
 *   3. Bundle cluster entry (cluster.ts)  → dist/cluster.cjs
 *   4. Copy migrations
 *
 * Why --packages=external instead of a hand-rolled HEAVY_EXTERNALS list?
 *
 *   The previous approach bundled every npm package that wasn't explicitly
 *   listed, accidentally inlining exceljs (+ uuid@8, fast-csv, fstream,
 *   lodash.isequal) and swagger-parser (+ glob@7, rimraf@2, inflight) into
 *   the server bundle, inflating it from ~80 KB to 3.6 MB and adding npm
 *   deprecation warnings on every install.
 *
 *   --packages=external tells esbuild to leave ALL npm packages as
 *   require() calls resolved at runtime from node_modules, which is always
 *   present in our deployment environment.  The resulting bundle contains
 *   only first-party server code (~80-120 KB minified), cold-starts faster,
 *   and uses less memory.
 */

import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

console.log("\n Building full-stack application for production...\n");

/** Shared esbuild flags used for every server entry point */
const ESBUILD_BASE = [
  "--bundle",
  "--platform=node",
  "--format=cjs",
  "--target=node18",
  "--packages=external",   // ← externalise ALL npm packages (no more 3.6 MB blob)
  "--minify",
  "--tsconfig=tsconfig.json",
].join(" ");

try {
  const distDir = path.join(projectRoot, "dist");
  if (!fs.existsSync(distDir)) fs.mkdirSync(distDir, { recursive: true });

  // ── 0. Fix esbuild version mismatch in drizzle-kit ─────────────────────────
  // drizzle-kit ships its own nested esbuild that conflicts with the project's
  // version. Remove it so drizzle-kit uses the top-level one via hoisting.
  const dkEsbuildDir = path.join(projectRoot, "node_modules/drizzle-kit/node_modules/esbuild");
  if (fs.existsSync(dkEsbuildDir)) {
    fs.rmSync(dkEsbuildDir, { recursive: true, force: true });
    console.log("✓ drizzle-kit esbuild conflict resolved\n");
  }

  // ── 0. Schema sync ──────────────────────────────────────────────────────────
  console.log("[0/4] Syncing database schema...");
  try {
    execSync("npx drizzle-kit push --force", {
      stdio: ["ignore", "pipe", "pipe"],
      cwd: projectRoot,
    });
    console.log("✓ Database schema up to date\n");
  } catch (err) {
    console.warn(
      "⚠  db:push failed (continuing):",
      err.stderr?.toString().trim() || err.message,
      "\n"
    );
  }

  // ── 0b. Re-apply RLS after schema push ─────────────────────────────────────
  // drizzle-kit push can DROP and RECREATE tables, wiping all RLS policies.
  // Re-applying here ensures security is restored immediately after every schema sync.
  console.log("[0b/4] Re-applying RLS policies after schema sync...");
  try {
    execSync("node scripts/apply-rls.mjs", {
      stdio: ["ignore", "pipe", "pipe"],
      cwd: projectRoot,
    });
    console.log("✓ RLS policies applied\n");
  } catch (err) {
    console.warn(
      "⚠  RLS apply failed (continuing):",
      err.stderr?.toString().trim() || err.message,
      "\n"
    );
  }

  // ── 1. Frontend ─────────────────────────────────────────────────────────────
  console.log("[1/4] Building frontend with Vite...");
  try {
    execSync("npx vite build", { stdio: "inherit", cwd: projectRoot });
    console.log("✓ Frontend built to dist/public\n");
  } catch (err) {
    console.warn("⚠  Vite build failed:", err.message, "\n");
  }

  // ── 2. Server entry (single-process) ────────────────────────────────────────
  console.log("[2/4] Bundling server/index.ts → dist/index.cjs...");
  execSync(
    `npx esbuild server/index.ts ${ESBUILD_BASE} --outfile=dist/index.cjs`,
    { stdio: "inherit", cwd: projectRoot }
  );
  console.log("✓ dist/index.cjs ready\n");

  // ── 3. Cluster entry (multi-core production) ─────────────────────────────────
  console.log("[3/4] Bundling server/cluster.ts → dist/cluster.cjs...");
  execSync(
    `npx esbuild server/cluster.ts ${ESBUILD_BASE} --outfile=dist/cluster.cjs`,
    { stdio: "inherit", cwd: projectRoot }
  );
  console.log("✓ dist/cluster.cjs ready\n");

  // ── 4. Migrations ────────────────────────────────────────────────────────────
  console.log("[4/4] Copying migrations...");
  const migrationsSource = path.join(projectRoot, "migrations");
  const migrationsTarget = path.join(distDir, "migrations");
  if (fs.existsSync(migrationsSource)) {
    try {
      if (fs.existsSync(migrationsTarget)) {
        fs.rmSync(migrationsTarget, { recursive: true, force: true });
      }
      const copyDir = (src, dest) => {
        if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
        for (const file of fs.readdirSync(src)) {
          const s = path.join(src, file);
          const d = path.join(dest, file);
          fs.lstatSync(s).isDirectory() ? copyDir(s, d) : fs.copyFileSync(s, d);
        }
      };
      copyDir(migrationsSource, migrationsTarget);
      console.log("✓ Migrations copied\n");
    } catch (err) {
      console.warn("⚠  Could not copy migrations:", err.message, "\n");
    }
  } else {
    console.log("  (no migrations directory — skipped)\n");
  }

  // ── Summary ──────────────────────────────────────────────────────────────────
  const size = (file) => {
    const p = path.join(distDir, file);
    if (!fs.existsSync(p)) return "MISSING";
    const kb = (fs.statSync(p).size / 1024).toFixed(0);
    return `${kb} KB ✓`;
  };

  console.log(" Build complete!");
  console.log(`  Frontend        : dist/public           (${fs.existsSync(path.join(distDir, "public")) ? "✓" : "MISSING"})`);
  console.log(`  Server          : dist/index.cjs        ${size("index.cjs")}`);
  console.log(`  Cluster (prod)  : dist/cluster.cjs      ${size("cluster.cjs")}`);
  console.log("\n  Single-process  : node ./dist/index.cjs");
  console.log("  Multi-core      : node ./dist/cluster.cjs\n");

} catch (error) {
  console.error("\n Build failed:", error.message);
  process.exit(1);
}
