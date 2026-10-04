// `npm run drive` — boot the production build and play scripted paths in Chromium,
// saving screenshots and any console errors to .drive/. This is how an agent sees
// the real UI (AGENTS.md "Validating a change in the real app").
//
//   npm run build && npm run drive              # all paths, seed 42
//   npm run drive -- --seed 7 --path fold        # one path, another seed
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { parseArgs } from "node:util"
import { chromium, type Page } from "playwright"
import { preview } from "vite"

const { values } = parseArgs({
  options: { seed: { type: "string", default: "42" }, path: { type: "string", default: "all" } },
})
const out = join(import.meta.dirname, "..", ".drive")
mkdirSync(out, { recursive: true })

type Shot = (name: string) => Promise<unknown>
const click = (page: Page, name: string | RegExp) => page.getByRole("button", { name }).first().click()
const inLobby = (page: Page) => page.getByRole("button", { name: /Deal a hand/ }).isVisible()

const visible = (page: Page, name: string | RegExp) => page.getByRole("button", { name }).first().isVisible()

const paths: Record<string, (page: Page, shot: Shot) => Promise<void>> = {
  // Deal; check or match each betting round; lock a card and gain; keep playing once, then call.
  full: async (page, shot) => {
    await shot("full-1-lobby")
    await click(page, /Deal a hand/)
    await shot("full-2-betting")
    let calls = 0
    for (let i = 0; i < 40 && !(await inLobby(page)); i++) {
      if (await visible(page, /^Match/)) await click(page, /^Match/)
      else if (await visible(page, "Check")) await click(page, "Check")
      else if (await visible(page, "Gain a card")) {
        const lock = page.locator("sabacc-seat").first().getByRole("button", { name: "Lock" }).first()
        if ((await lock.isVisible()) && (await lock.isEnabled())) await lock.click()
        await shot("full-3-drawing")
        await click(page, "Gain a card")
      } else if (await visible(page, "Call the hand")) {
        await shot("full-4-call-window")
        await click(page, calls++ === 0 ? "Keep playing" : "Call the hand")
      }
    }
    await page.getByText(/Game log/).click()
    await shot("full-5-showdown")
  },
  fold: async (page, shot) => {
    await click(page, /Deal a hand/)
    await click(page, "Fold")
    await shot("fold-1-result")
  },
  rules: async (page, shot) => {
    await page.getByRole("link", { name: "Rules" }).click()
    await shot("rules-1")
  },
}

const server = await preview({ preview: { port: 4173, strictPort: false } })
const url = server.resolvedUrls?.local[0] ?? "http://localhost:4173/"
const browser = await chromium.launch()
const report: Array<{ path: string; scheme: string; viewport: string; errors: ReadonlyArray<string> }> = []

for (const [name, run] of Object.entries(paths)) {
  if (values.path !== "all" && values.path !== name) continue
  for (const scheme of ["dark", "light"] as const) {
    for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
      const page = await browser.newPage({ colorScheme: scheme, viewport })
      const errors: Array<string> = []
      page.on("console", (m) => m.type() === "error" && errors.push(m.text()))
      page.on("pageerror", (e) => errors.push(e.message))
      await page.goto(`${url}?seed=${values.seed}`)
      await page.locator("sabacc-table").getByRole("button").first().waitFor()
      const tag = `${scheme}-${viewport.width}`
      await run(page, (name) => page.screenshot({ path: join(out, `${name}-${tag}.png`), fullPage: true }))
      report.push({ path: name, scheme, viewport: `${viewport.width}x${viewport.height}`, errors })
      await page.close()
    }
  }
}

await browser.close()
await new Promise<void>((resolve) => server.httpServer.close(() => resolve()))
writeFileSync(join(out, "report.json"), JSON.stringify(report, null, 2))
const failed = report.filter((r) => r.errors.length > 0)
console.log(`drive: ${report.length} runs, ${failed.length} with console errors. Screenshots in .drive/`)
for (const r of failed) console.error(`${r.path} ${r.scheme} ${r.viewport}: ${r.errors.join(" | ")}`)
process.exitCode = failed.length === 0 ? 0 : 1
