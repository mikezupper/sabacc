import { resolve } from "node:path"
import { gyralVitePreset } from "@gyral/core/vite"
import { defineConfig } from "vite"

// Gyral's preset: its template compiler runs in `vite build` (a template rule break fails
// the build) and its dev-server plugin keeps one @gyral/core. Keep it first.
export default defineConfig({
  ...gyralVitePreset(),
  build: {
    target: "es2022",
    // Every browser that runs this site's CSS supports <link rel="modulepreload">.
    modulePreload: { polyfill: false },
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
