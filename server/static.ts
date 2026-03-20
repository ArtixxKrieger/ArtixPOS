import express, { type Express } from "express";
import fs from "fs";
import path from "path";

export function serveStatic(app: Express) {
  // Handle both development and production paths
  // In development: __dirname is dist/server, so ../public works
  // In production/Vercel: __dirname is dist/server, so ../public works
  // But if called from api/, __dirname is dist/api, so ../../public works
  let distPath = path.resolve(__dirname, "../public");
  
  // Fallback to alternative path if not found
  if (!fs.existsSync(distPath)) {
    distPath = path.resolve(__dirname, "../../public");
  }
  
  if (!fs.existsSync(distPath)) {
    console.warn(
      `Warning: Could not find the build directory at ${distPath}`,
    );
    // Don't throw, just skip static serving - API can still work
    return;
  }

  app.use(express.static(distPath));

  // fall through to index.html if the file doesn't exist
  app.use("/{*path}", (_req, res) => {
    const indexPath = path.resolve(distPath, "index.html");
    if (fs.existsSync(indexPath)) {
      res.sendFile(indexPath);
    } else {
      res.status(404).json({ error: "Not found" });
    }
  });
}
