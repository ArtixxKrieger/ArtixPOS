import express, { type Express } from "express";
import fs from "fs";
import path from "path";

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

    return;
  }

  console.log(`Serving static files from: ${distPath}`);

_vendorLinkHeader = resolveVendorLinkHeader(path.join(distPath, "assets"));

app.get(["/sw.js", "/manifest.json"], (_req, res, next) => {
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    next();
  });

app.use(
    express.static(distPath, {
      maxAge: "1y",
      immutable: true,
      index: false,
    }),
  );

app.use("/{*path}", (_req, res) => {
    const indexPath = path.resolve(distPath, "index.html");
    if (fs.existsSync(indexPath)) {
      res.setHeader("Cache-Control", "no-cache");

if (_vendorLinkHeader) {
        res.setHeader("Link", _vendorLinkHeader);
      }
      res.sendFile(indexPath);
    } else {
      res.status(404).json({ error: "Not found" });
    }
  });
}
