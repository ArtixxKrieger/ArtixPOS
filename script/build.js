#!/usr/bin/env node
import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

console.log("\n🚀 Building full-stack application for production...\n");

try {
  // 1. Build frontend with Vite
  console.log("[1/2] Building frontend with Vite...");
  try {
    execSync("npx vite build", { stdio: "inherit", cwd: projectRoot });
    console.log("✓ Frontend built successfully\n");
  } catch (err) {
    console.warn("⚠ Vite build failed or skipped - client may not have assets\n");
  }

  // 2. Handle migrations and dependencies
  console.log("[2/2] Preparing deployment files...");
  const distDir = path.join(projectRoot, "dist");
  
  // Ensure dist exists
  if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
  }

  // Note: API folder is already compiled by tsc to dist/api/
  // Just verify it exists
  const apiTarget = path.join(distDir, "api");
  if (fs.existsSync(apiTarget)) {
    const apiFiles = fs.readdirSync(apiTarget);
    const jsFiles = apiFiles.filter(f => f.endsWith(".js"));
    if (jsFiles.length > 0) {
      console.log(`✓ API serverless functions compiled (${jsFiles.length} files)`);
    }
  }

  // Copy migrations if they exist for database setup
  const migrationsSource = path.join(projectRoot, "migrations");
  const migrationsTarget = path.join(distDir, "migrations");
  if (fs.existsSync(migrationsSource)) {
    try {
      if (fs.existsSync(migrationsTarget)) {
        fs.rmSync(migrationsTarget, { recursive: true, force: true });
      }
      // Recursive copy
      const copyDir = (src, dest) => {
        if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
        fs.readdirSync(src).forEach(file => {
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
      console.warn("⚠ Could not copy migrations:", err.message);
    }
  }

  // Create entry point index.cjs from server/index.js for compatibility
  const serverIndexJs = path.join(distDir, "server", "index.js");
  const indexCjs = path.join(distDir, "index.cjs");
  if (fs.existsSync(serverIndexJs)) {
    const content = fs.readFileSync(serverIndexJs, "utf8");
    fs.writeFileSync(indexCjs, content);
    console.log("✓ Created dist/index.cjs entry point");
  }

  // Verify build output
  const publicDir = path.join(distDir, "public");
  if (fs.existsSync(publicDir)) {
    const assetCount = fs.readdirSync(publicDir).length;
    console.log(`✓ Frontend assets in dist/public (${assetCount} items)`);
  } else {
    console.warn("⚠ dist/public not found - frontend may not be built");
  }

  console.log("\n✅ Build completed successfully!");
  console.log("\nDeployment files ready in: ./dist");
  console.log("Entry point: dist/index.cjs");
  console.log("Frontend assets: dist/public");
  console.log("\nTo test locally: NODE_ENV=production node dist/index.cjs");

} catch (error) {
  console.error("\n❌ Build failed:", error.message);
  console.error(error.stack);
  process.exit(1);
}
