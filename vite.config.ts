import { resolve } from "node:path"
import { defineConfig } from "vite"

export default defineConfig({
  build: {
    target: "es2022",
    // The 3D page's chunk carries Three.js (~620 KB, 160 KB gzip); the 2D page never loads it.
    chunkSizeWarningLimit: 700,
    // Two pages, one engine: the classic table and the 3D table share chunks.
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, "index.html"),
        "3d": resolve(import.meta.dirname, "3d.html"),
      },
    },
  },
  server: {
    allowedHosts: ["localhost", ".pages.dev", ".open-pool.com", ".video-miner.xyz"],
    // Multiplayer in development: run `npm run dev:server` next to `npm run dev`.
    proxy: {
      "/api": "http://localhost:8787",
      "/ws": { target: "ws://localhost:8787", ws: true },
    },
  },
})
