import type { Express } from "express";

const BASE_URL = "https://artixpos.com";

export function registerSeoRoutes(app: Express) {
  app.get("/sitemap.xml", (_req, res) => {
    const today = new Date().toISOString().split("T")[0];

    const urls = [
      { loc: `${BASE_URL}/`, priority: "1.0", changefreq: "weekly" },
      { loc: `${BASE_URL}/#features`, priority: "0.8", changefreq: "monthly" },
      { loc: `${BASE_URL}/#pricing`, priority: "0.8", changefreq: "weekly" },
      { loc: `${BASE_URL}/#security`, priority: "0.6", changefreq: "monthly" },
    ];

    const xml = [
      `<?xml version="1.0" encoding="UTF-8"?>`,
      `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
      ...urls.map(
        ({ loc, priority, changefreq }) =>
          `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>${changefreq}</changefreq>\n    <priority>${priority}</priority>\n  </url>`
      ),
      `</urlset>`,
    ].join("\n");

    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.send(xml);
  });
}
