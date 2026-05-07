import express, { type Express } from "express";
import fs from "fs";
import path from "path";

// ── HTTP/2 Server Push hint ────────────────────────────────────────────────
// Resolved once at startup so every request avoids a filesystem scan.
// The vendor chunk is the heaviest JS asset; preloading it shaves TTI on
// first visit because the browser can pipeline the download alongside HTML.
let _vendorLinkHeader: string | null = null;

function resolveVendorLinkHeader(assetsDir: string): string | null {
  if (!fs.existsSync(assetsDir)) return null;
  try {
    const files = fs.readdirSync(assetsDir);
    const vendorFile = files.find(f => /^vendor-[A-Za-z0-9]+\.js$/.test(f));
    if (!vendorFile) return null;
    const header = `</assets/${vendorFile}>; rel=preload; as=script; crossorigin`;
    console.log(`[static] HTTP/2 push hint: ${header}`);
    return header;
  } catch {
    return null;
  }
}

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

  // Resolve vendor chunk filename once at startup
  _vendorLinkHeader = resolveVendorLinkHeader(path.join(distPath, "assets"));

  // sw.js and manifest.json must NEVER be cached long-term.
  // sw.js: browsers cap SW update checks at 24h if max-age > 0 — no-cache
  //        forces a byte-for-byte check on every navigation, so new SWs
  //        are detected within one page load.
  // manifest.json: must be fresh so icon/name changes propagate immediately.
  app.get(["/sw.js", "/manifest.json"], (_req, res, next) => {
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    next();
  });

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
      // HTTP/2 server push hint — browser can pipeline vendor chunk download
      // alongside initial HTML parse, cutting first-visit TTI.
      if (_vendorLinkHeader) {
        res.setHeader("Link", _vendorLinkHeader);
      }
      res.sendFile(indexPath);
    } else {
      res.status(404).json({ error: "Not found" });
    }
  });
}
