import { gyralVitePreset } from "@gyral/core/vite"
import { playwright } from "@vitest/browser-playwright"
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    projects: [
      { test: { name: "unit", environment: "node", include: ["test/unit/**/*.test.ts"], testTimeout: 30_000, hookTimeout: 30_000 } },
      {
        // Components run in real Chromium with Gyral's runtime template checks. The preset
        // pre-bundles every installed Gyral package, so Vite never discovers one mid-run.
        ...gyralVitePreset({ clientOnly: true }),
        test: {
          name: "browser",
          include: ["test/browser/**/*.test.ts"],
          // SwiftShader shares CPU with dev/CI jobs. Concurrent scene files can
          // starve rendering and time out otherwise passing WebGL tests.
          fileParallelism: false,
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
