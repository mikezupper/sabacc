// `npm run drive` — boot the production build and play scripted paths in Chromium,
// saving screenshots and any console errors to .drive/. This is how an agent sees
// the real UI (AGENTS.md "Validating a change in the real app").
//
//   npm run build && npm run drive              # all paths, seed 42
//   npm run drive -- --seed 7 --path fold        # one path, another seed
import { spawn } from "node:child_process"
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
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

/** "Skip ahead" vanishes when playback ends, so it can disappear between the check and the click. */
const skipIfPlaying = async (page: Page) => {
  if (await visible(page, "Skip ahead")) await page.getByRole("button", { name: "Skip ahead" }).first().click({ timeout: 1500 }).catch(() => undefined)
}

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
  // Real motion: catch opponents' turns mid-playback, then skip ahead.
  playback: async (page, shot) => {
    await click(page, /Deal a hand/)
    await page.waitForTimeout(1200)
    await shot("playback-1-mid")
    await skipIfPlaying(page)
    await shot("playback-2-your-turn")
  },
  // Saved table: deal, reload without a seed, and the hand is still there.
  restore: async (page, shot) => {
    await page.goto(page.url().replace(/\?seed=\d+/, ""))
    await page.locator("sabacc-table").getByRole("button").first().waitFor()
    await click(page, /Deal a hand/)
    await page.reload()
    await page.locator("sabacc-table").getByRole("button").first().waitFor()
    await shot("restore-1-after-reload")
  },
  // The 3D table (3d.html): deal, play a hand with real motion, pick and lock a card, call.
  "3d": async (page, shot) => {
    const settle = () => page.waitForTimeout(400)
    const skip = async () => {
      await skipIfPlaying(page)
      await settle()
    }
    await shot("3d-1-lobby")
    await click(page, /Deal a hand/)
    await page.waitForTimeout(1500)
    await shot("3d-2-dealing")
    let calls = 0
    let locked = false
    for (let i = 0; i < 60 && !(await inLobby(page)); i++) {
      await skip()
      if (await visible(page, /^Match/)) await click(page, /^Match/)
      else if (await visible(page, "Check")) await click(page, "Check")
      else if (await visible(page, "Gain a card")) {
        if (!locked) {
          // Pick a card (the 3D view lists your free cards), lock it, then gain.
          await page.getByRole("group", { name: "Choose a card to lock or trade" }).getByRole("button").first().click()
          await settle()
          await shot("3d-3-picked")
          await click(page, "Lock")
          await settle()
          locked = true
        }
        await click(page, "Gain a card")
        await page.waitForTimeout(900)
        await shot("3d-4-after-draw")
      } else if (await visible(page, "Call the hand")) {
        await click(page, calls++ === 0 ? "Keep playing" : "Call the hand")
      }
    }
    await page.waitForTimeout(2500)
    await skip()
    await page.waitForTimeout(1500)
    await shot("3d-5-showdown")
  },
  // A Sabacc Shift in 3D (seed 14 shifts after your second move): catch the cards mid-spin.
  "3d-shift": async (page, shot) => {
    await page.goto(page.url().replace(/seed=\d+/, "seed=14"))
    await page.locator("sabacc-3d").getByRole("button").first().waitFor()
    await click(page, /Deal a hand/)
    for (let moves = 0; moves < 2; ) {
      if (await visible(page, "Skip ahead")) await skipIfPlaying(page)
      else if (await visible(page, /^Match/)) (await click(page, /^Match/), moves++)
      else if (await visible(page, "Check")) (await click(page, "Check"), moves++)
      else if (await visible(page, "Gain a card")) (await click(page, "Gain a card"), moves++)
      await page.waitForTimeout(300)
    }
    const alert = page.getByRole("alert").filter({ hasText: "Sabacc Shift" })
    await alert.waitFor({ timeout: 30_000 })
    await page.waitForTimeout(450)
    await shot("3d-shift-1-spinning")
    await page.waitForTimeout(1300)
    await shot("3d-shift-2-landed")
  },
  multiplayer: async () => {}, // runs separately below: it needs the game server and two browsers
  rules: async (page, shot) => {
    await page.getByRole("link", { name: "Rules" }).click()
    await shot("rules-1")
  },
}

const server = await preview({ preview: { port: 4173, strictPort: false } })
const url = server.resolvedUrls?.local[0] ?? "http://localhost:4173/"
// WebGL in headless Chromium: SwiftShader software rendering (the 3D path needs it).
const browser = await chromium.launch({ args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader"] })
const report: Array<{ path: string; scheme: string; viewport: string; errors: ReadonlyArray<string> }> = []

for (const [name, run] of Object.entries(paths)) {
  if (values.path !== "all" && values.path !== name) continue
  if (name === "multiplayer") continue
  for (const scheme of ["dark", "light"] as const) {
    for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
      // Scripted paths use reduced motion (instant playback); `playback` and `3d` keep real motion.
      const motion = name === "playback" || name.startsWith("3d")
      const page = await browser.newPage({ colorScheme: scheme, viewport, reducedMotion: motion ? "no-preference" : "reduce" })
      const errors: Array<string> = []
      page.on("console", (m) => m.type() === "error" && errors.push(m.text()))
      page.on("pageerror", (e) => errors.push(e.message))
      const threeD = name.startsWith("3d")
      await page.goto(`${url}${threeD ? "3d.html" : ""}?seed=${values.seed}`)
      await page.locator(threeD ? "sabacc-3d" : "sabacc-table").getByRole("button").first().waitFor()
      if (threeD) await page.waitForTimeout(800)
      const tag = `${scheme}-${viewport.width}`
      await run(page, (name) => page.screenshot({ path: join(out, `${name}-${tag}.png`), fullPage: true }))
      report.push({ path: name, scheme, viewport: `${viewport.width}x${viewport.height}`, errors })
      await page.close()
    }
  }
}

// Multiplayer: the real game server on the build, two players in two browsers — Han on
// the classic table (desktop, dark), Lando on the 3D table (phone, light).
if (values.path === "all" || values.path === "multiplayer") {
  const port = 4190
  const game = spawn(process.execPath, ["src/server/main.ts"], {
    env: { ...process.env, PORT: String(port), STATIC_DIR: "dist", DATA_DIR: mkdtempSync(join(tmpdir(), "sabacc-drive-")), AUTO_DEAL_SECONDS: "600" },
    stdio: "ignore",
  })
  const base = `http://localhost:${port}`
  for (let i = 0; i < 50; i++) {
    if (await fetch(`${base}/healthz`).then((r) => r.ok, () => false)) break
    await new Promise((r) => setTimeout(r, 200))
  }
  const errors: Array<string> = []
  const open = async (scheme: "dark" | "light", viewport: { width: number; height: number }) => {
    const page = await browser.newPage({ colorScheme: scheme, viewport })
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()))
    page.on("pageerror", (e) => errors.push(e.message))
    return page
  }
  const shot = (page: Page, name: string) => page.screenshot({ path: join(out, `mp-${name}.png`), fullPage: true })
  const han = await open("dark", { width: 1280, height: 900 })
  const lando = await open("light", { width: 390, height: 844 })
  try {
    await han.goto(`${base}/`)
    await click(han, "Play with friends")
    await han.getByLabel("Your name").fill("Han")
    await click(han, "Join the table")
    await han.getByText(/Table [A-Z0-9]{6}/).first().waitFor()
    const room = new URL(han.url()).searchParams.get("room") ?? ""
    await lando.goto(`${base}/3d.html?room=${room}`)
    await lando.getByLabel("Your name").fill("Lando")
    await click(lando, "Join the table")
    await lando.locator("sabacc-3d").getByRole("button").first().waitFor()
    await han.waitForTimeout(800)
    await shot(han, "1-han-lobby")
    await shot(lando, "1-lando-lobby-3d")
    await click(han, /Deal a hand/)
    // Each plays safe moves on their turn until the hand ends.
    const moves = ["Skip ahead", "Check", /^Match/, "Stand", "Call the hand"] as const
    let shotMid = false
    for (let i = 0; i < 120; i++) {
      for (const page of [han, lando]) {
        for (const name of moves)
          if (await visible(page, name)) {
            // Playback can finish (and the button vanish) between the check and the click.
            await page.getByRole("button", { name }).first().click({ timeout: 1500 }).catch(() => undefined)
            break
          }
      }
      if (!shotMid && (await visible(han, "Stand"))) {
        await shot(han, "2-han-drawing")
        await shot(lando, "2-lando-3d")
        shotMid = true
      }
      if ((await inLobby(han)) && (await visible(lando, /Deal a hand/))) break
      await han.waitForTimeout(250)
    }
    await han.waitForTimeout(1500)
    await shot(han, "3-han-result")
    await shot(lando, "3-lando-result-3d")
  } finally {
    report.push({ path: "multiplayer", scheme: "dark+light", viewport: "1280+390", errors })
    game.kill()
  }
}

await browser.close()
await new Promise<void>((resolve) => server.httpServer.close(() => resolve()))
writeFileSync(join(out, "report.json"), JSON.stringify(report, null, 2))
const failed = report.filter((r) => r.errors.length > 0)
console.log(`drive: ${report.length} runs, ${failed.length} with console errors. Screenshots in .drive/`)
for (const r of failed) console.error(`${r.path} ${r.scheme} ${r.viewport}: ${r.errors.join(" | ")}`)
process.exitCode = failed.length === 0 ? 0 : 1
