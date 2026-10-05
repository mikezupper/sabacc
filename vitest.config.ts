import { playwright } from "@vitest/browser-playwright"
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    projects: [
      { test: { name: "unit", environment: "node", include: ["test/unit/**/*.test.ts"], testTimeout: 30_000, hookTimeout: 30_000 } },
      {
        test: {
          name: "browser",
          include: ["test/browser/**/*.test.ts"],
          browser: {
            enabled: true,
            headless: true,
            // SwiftShader gives headless Chromium WebGL for the 3D view's tests.
            provider: playwright({ launchOptions: { args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader"] } }),
            instances: [{ browser: "chromium" }],
          },
        },
      },
    ],
  },
})
