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
          // Core React runtime — tiny, loads first, heavily cached
          if (id.includes("node_modules/react/") || id.includes("node_modules/react-dom/")) {
            return "react-vendor";
          }
          // Routing — needed immediately after React
          if (id.includes("node_modules/wouter")) {
            return "react-vendor";
          }
          // Data fetching — loaded with every authenticated view
          if (id.includes("node_modules/@tanstack/")) {
            return "react-vendor";
          }
          // Radix UI primitives — large but cacheable
          if (id.includes("node_modules/@radix-ui/")) {
            return "ui-radix";
          }
          // Charts — only needed on analytics page
          if (id.includes("node_modules/recharts") || id.includes("node_modules/d3-")) {
            return "charts";
          }
          // Animation — framer-motion is heavy, lazy loaded
          if (id.includes("node_modules/framer-motion")) {
            return "motion";
          }
          // PDF generation — only needed for receipts/reports
          if (id.includes("node_modules/jspdf") || id.includes("node_modules/jspdf-autotable")) {
            return "pdf";
          }
          // Spreadsheet export — only on export actions
          if (id.includes("node_modules/xlsx")) {
            return "xlsx";
          }
          // Date utilities
          if (id.includes("node_modules/date-fns")) {
            return "date-fns";
          }
          // Capacitor native bridge — only used in native apps
          if (id.includes("node_modules/@capacitor/")) {
            return "capacitor";
          }
          // Icons — lucide and react-icons are large
          if (id.includes("node_modules/lucide-react") || id.includes("node_modules/react-icons")) {
            return "icons";
          }
          // Zod + form validation
          if (id.includes("node_modules/zod") || id.includes("node_modules/@hookform/") || id.includes("node_modules/react-hook-form")) {
            return "forms";
          }
          // Embla carousel
          if (id.includes("node_modules/embla-carousel")) {
            return "ui-extras";
          }
          // Everything else in node_modules
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
