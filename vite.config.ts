import { defineConfig } from "vite"

export default defineConfig({
  build: { target: "es2022" },
  server: {
    allowedHosts: ["localhost", ".pages.dev", ".open-pool.com", ".video-miner.xyz"],
  },
})
