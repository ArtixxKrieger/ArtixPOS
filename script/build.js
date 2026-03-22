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

  // 1. Build frontend with Vite
  console.log("[1/2] Building frontend with Vite...");
  try {
    execSync("npx vite build", { stdio: "inherit", cwd: projectRoot });
    console.log("✓ Frontend built successfully\n");
  } catch (err) {
    console.warn("⚠  Vite build failed:", err.message, "\n");
  }

  // 2. Bundle server with esbuild → proper CJS output (avoids ESM-in-.cjs problem)
  console.log("[2/2] Bundling server with esbuild...");
  execSync(
    [
      "npx esbuild server/index.ts",
      "--bundle",
      "--platform=node",
      "--format=cjs",
      "--target=node18",
      "--outfile=dist/index.cjs",
      // Keep native addons and heavy db clients external so esbuild doesn't try to bundle binaries
      "--external:better-sqlite3",
      "--external:@libsql/client",
      "--external:pg",
      "--external:pg-native",
      "--external:bcrypt",
      "--external:bcryptjs",
      "--packages=external",
      // Resolve TypeScript path aliases
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
          if (fs.lstatSync(srcPath).isDirectory()) {
            copyDir(srcPath, destPath);
          } else {
            fs.copyFileSync(srcPath, destPath);
          }
        });
      };
      copyDir(migrationsSource, migrationsTarget);
      console.log("✓ Migrations copied");
    } catch (err) {
      console.warn("⚠  Could not copy migrations:", err.message);
    }
  }

  // Summary
  const publicDir = path.join(distDir, "public");
  const publicOk = fs.existsSync(publicDir);
  const cjsOk = fs.existsSync(path.join(distDir, "index.cjs"));

  console.log("\n Build complete!");
  console.log(`  Frontend : dist/public (${publicOk ? "✓" : "missing"})`);
  console.log(`  Server   : dist/index.cjs (${cjsOk ? "✓" : "missing"})`);
  console.log("\n  Local test: NODE_ENV=production node dist/index.cjs");
  console.log("  Vercel   : @vercel/node compiles server/index.ts directly\n");
} catch (error) {
  console.error("\n Build failed:", error.message);
  process.exit(1);
}
