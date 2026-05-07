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
          // ALL node_modules go into one vendor chunk.
          //
          // Splitting node_modules into separate chunks (react-vendor, charts,
          // motion, etc.) creates circular chunk dependencies in Rollup's output
          // because many packages call createContext() / use const-TDZ values
          // at module top level. When chunks execute in the wrong order those
          // exports are undefined → ReferenceError / TypeError → white screen.
          //
          // A single large vendor chunk is heavily cached (immutable hash URL)
          // and only downloaded once. Page-level code is already split via
          // React.lazy() so the lazy routes stay in their own small chunks.
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
