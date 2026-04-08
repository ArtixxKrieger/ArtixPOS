import express, { type Express } from "express";
import fs from "fs";
import path from "path";

export function serveStatic(app: Express) {
  // Try paths in order of reliability:
  // 1. process.cwd()/dist/public — most reliable on Vercel Lambda (/var/task)
  // 2. __dirname/../public — compiled output at dist/server → dist/public
  // 3. __dirname/../../public — if bundled at different depth
  const candidates = [
    path.resolve(process.cwd(), "dist/public"),
    path.resolve(__dirname, "../public"),
    path.resolve(__dirname, "../../public"),
  ];

  const distPath = candidates.find((p) => fs.existsSync(p));

  if (!distPath) {
    console.warn(
      `Warning: Could not find the build directory. Tried:\n  ${candidates.join("\n  ")}`,
    );
    // API still works — just no static files
    return;
  }

  console.log(`Serving static files from: ${distPath}`);

  // Cache-control: long for hashed assets, short for everything else
  app.use(
    express.static(distPath, {
      maxAge: "1y",
      immutable: true,
      index: false, // we handle index.html ourselves below
    }),
  );

  // SPA fallback — all non-asset routes serve index.html
  app.use("/{*path}", (_req, res) => {
    const indexPath = path.resolve(distPath, "index.html");
    if (fs.existsSync(indexPath)) {
      res.setHeader("Cache-Control", "no-cache");
      res.sendFile(indexPath);
    } else {
      res.status(404).json({ error: "Not found" });
    }
  });
}
