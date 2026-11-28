import { resolve } from "node:path"
import tailwindcss from "@tailwindcss/vite"
import { tanstackRouter } from "@tanstack/router-plugin/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

import { budgetPlugin } from "./build/budget.ts"
import { precompressPlugin } from "./build/precompress.ts"

export default defineConfig({
  plugins: [
    // Must come before React: it writes src/routeTree.gen.ts from src/routes.
    tanstackRouter({ target: "react", autoCodeSplitting: true }),
    react(),
    tailwindcss(),
    precompressPlugin(),
    // After precompress, so it can read the .br files that wrote.
    budgetPlugin(),
  ],
  resolve: {
    alias: { "@": resolve(import.meta.dirname, "./src") },
  },
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            // An icon is a file of its own otherwise: one per set of pages.
            {
              name: "icons",
              test: /[\\/]@hugeicons[\\/]core-free-icons[\\/]/,
              priority: 2,
              entriesAware: true,
              entriesAwareMergeThreshold: 16 * 1024,
            },
            // Libraries and UI primitives most pages use, in one file. Not
            // the app's features: those bring the foods vocabulary in with
            // them.
            {
              name: "common",
              test: /[\\/]node_modules[\\/]|[\\/]src[\\/](components[\\/]ui|lib)[\\/]/,
              priority: 1,
              minShareCount: 4,
            },
          ],
        },
      },
    },
  },
  server: {
    // The API runs on its own in development (apps/server on :3000).
    // xfwd keeps the browser's address, so links the API makes (invite
    // links) point back here.
    proxy: {
      "/.well-known": { target: "http://localhost:3000", xfwd: true },
      "/api": { target: "http://localhost:3000", xfwd: true },
      "/mcp": { target: "http://localhost:3000", xfwd: true },
    },
  },
})
