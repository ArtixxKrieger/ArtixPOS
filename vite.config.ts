import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

export default defineConfig({
  base: "/",
  plugins: [
    react(),
    runtimeErrorOverlay(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(process.cwd(), "client", "src"),
      "@shared": path.resolve(process.cwd(), "shared"),
      "@assets": path.resolve(process.cwd(), "attached_assets"),
    },
  },
  root: path.resolve(process.cwd(), "client"),
  publicDir: path.resolve(process.cwd(), "public"),
  build: {
    outDir: path.resolve(process.cwd(), "dist/public"),
    emptyOutDir: true,
    assetsDir: "assets",
    target: "es2020",
    cssCodeSplit: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Only split out chunks that are truly independent (no React imports
          // at the module top level) to avoid circular chunk dependencies.
          // Circular deps cause exports to be undefined at init time → white screen.
          //
          // React + all React-ecosystem packages (framer-motion, tanstack,
          // radix, wouter, etc.) stay together in "vendor" so React is always
          // fully initialised before any package that calls createContext().

          // Charts — recharts/d3 are page-level lazy imports only
          if (id.includes("node_modules/recharts") || id.includes("node_modules/d3-")) {
            return "charts";
          }
          // PDF generation — only needed for receipts/reports
          if (id.includes("node_modules/jspdf") || id.includes("node_modules/jspdf-autotable")) {
            return "pdf";
          }
          // Spreadsheet export — only on export actions
          if (id.includes("node_modules/xlsx")) {
            return "xlsx";
          }
          // Everything else (React, framer-motion, tanstack, radix, date-fns,
          // icons, forms, capacitor, etc.) → single vendor chunk.
          // One large cached chunk beats an unmountable app.
          if (id.includes("node_modules/")) {
            return "vendor";
          }
        },
      },
    },
  },
  server: {
    host: "0.0.0.0",
    port: 5000,
    allowedHosts: true,
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
