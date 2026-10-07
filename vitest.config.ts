import { gyralVitePreset } from "@gyral/core/vite"
import { playwright } from "@vitest/browser-playwright"
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    projects: [
      { test: { name: "unit", environment: "node", include: ["test/unit/**/*.test.ts"], testTimeout: 30_000, hookTimeout: 30_000 } },
      {
        // Components run in real Chromium with Gyral's runtime template checks. Pre-bundle
        // Gyral so Vite never discovers it mid-run (which reloads the test page).
        ...gyralVitePreset({ optimize: ["@gyral/core", "@gyral/time", "@gyral/http"] }),
        test: {
          name: "browser",
          include: ["test/browser/**/*.test.ts"],
          // The 3D tests draw WebGL in software (SwiftShader); on a busy machine (CI shares
          // the dev machine) they can pass 15 s.
          testTimeout: 30_000,
          hookTimeout: 30_000,
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
