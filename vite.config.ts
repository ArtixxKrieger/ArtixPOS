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
    // Target modern browsers — smaller, faster output (no IE polyfills)
    target: ["es2020", "chrome89", "safari14", "firefox90"],
    cssCodeSplit: true,
    // Raise the warning threshold — our single vendor chunk is intentionally large
    chunkSizeWarningLimit: 2500,
    // Minification: esbuild is ~10-20× faster than terser with near-identical output
    minify: "esbuild",
    sourcemap: false,
    rollupOptions: {
      output: {
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
        manualChunks(id) {
          if (id.includes("node_modules/")) {
            return "vendor";
          }
        },
        // Use content-hash for all output filenames — enables infinite cache TTL
        entryFileNames: "assets/[name]-[hash].js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash].[ext]",
      },
    },
  },
  server: {
    host: "0.0.0.0",
    port: 5000,
    allowedHosts: true,
    // Warm up the most-visited modules so first HMR is instant
    warmup: {
      clientFiles: [
        "./src/main.tsx",
        "./src/App.tsx",
        "./src/pages/dashboard.tsx",
        "./src/pages/pos.tsx",
        "./src/components/layout/app-layout.tsx",
      ],
    },
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
  // Pre-bundle deps that are slow to transform on first import
  optimizeDeps: {
    include: [
      "react",
      "react-dom",
      "react-dom/client",
      "@tanstack/react-query",
      "wouter",
      "lucide-react",
      "clsx",
      "tailwind-merge",
      "class-variance-authority",
      "zod",
      "date-fns",
      "recharts",
    ],
    // Force re-bundle when lock file changes
    force: false,
  },
  // esbuild transform options (applies to both dev and build)
  esbuild: {
    // Drop console.log in production to shave a few KB and improve perf
    drop: process.env.NODE_ENV === "production" ? ["console", "debugger"] : [],
    // Pure annotation — tree-shake React.createElement in JSX
    pure: process.env.NODE_ENV === "production"
      ? ["console.log", "console.debug", "console.info"]
      : [],
    legalComments: "none",
  },
});
