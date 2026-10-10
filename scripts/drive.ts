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
  options: {
    seed: { type: "string", default: "42" },
    path: { type: "string", default: "all" },
    scheme: { type: "string", default: "all" },
    viewport: { type: "string", default: "all" },
  },
})
if (!["all", "dark", "light"].includes(values.scheme)) throw new Error("--scheme must be all, dark or light")
if (!["all", "desktop", "phone"].includes(values.viewport)) throw new Error("--viewport must be all, desktop or phone")
const out = join(import.meta.dirname, "..", ".drive")
mkdirSync(out, { recursive: true })

type Shot = (name: string) => Promise<unknown>
const click = (page: Page, name: string | RegExp) => page.getByRole("button", { name }).first().click()
const inLobby = (page: Page) => page.getByRole("button", { name: /Deal a hand/ }).isVisible()

const visible = (page: Page, name: string | RegExp) => page.getByRole("button", { name }).first().isVisible()

/** Capture a fresh 3D frame inside the fixed viewport, including on short screens. */
const screenshot = async (page: Page, path: string, threeD: boolean) => {
  if (!threeD) return page.screenshot({ path, fullPage: true })
  await page.evaluate(async () => {
    await document.fonts.ready
    // Capture a completed frame after a scene update, including a shift's new cards.
    for (let i = 0; i < 2; i++) await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  })
  return page.screenshot({ path, fullPage: false })
}

/** Projected plates and the compact player list must stay readable at every size. */
const tableHudProblems = async (page: Page): Promise<Array<string>> => {
  return page.evaluate(() => {
    const root = document.querySelector("sabacc-3d")?.shadowRoot
    if (root === undefined || root === null) return []
    const scene = root.querySelector(".stage")!.getBoundingClientRect()
    const side = root.querySelector(".side")?.getBoundingClientRect()
    if (side === undefined) return [] // the naming form precedes the room/log panel
    const problems: Array<string> = []
    const shift = root.querySelector(".shift")
    if (shift) {
      const r = shift.getBoundingClientRect()
      const x = r.x + r.width / 2
      const y = r.y + r.height / 2
      if (x >= 0 && x < innerWidth && y >= 0 && y < innerHeight && root.elementFromPoint(x, y) !== shift)
        problems.push("Sabacc Shift banner is covered by the scene")
    }
    const plates = [...root.querySelectorAll(".stage sabacc-plate")]
    if (plates.length !== 5) problems.push(`Expected 5 player plates; got ${plates.length}`)
    for (const plate of plates) {
      const p = plate.shadowRoot!.querySelector(".plate")!
      const r = p.getBoundingClientRect()
      const left = Math.max(r.left, scene.left)
      const right = Math.min(r.right, scene.right)
      const top = Math.max(r.top, scene.top)
      const bottom = Math.min(r.bottom, scene.bottom)
      if (right <= left || bottom <= top) problems.push(`Player plate is clipped: ${p.textContent?.trim()}`)
      else if (left < side.right && right > side.left && top < side.bottom && bottom > side.top) problems.push(`Player plate overlaps room/log: ${p.textContent?.trim()}`)
    }
    const bounds = root.host.getBoundingClientRect()
    const names = [...root.querySelectorAll("sabacc-plate")]
      .map((p) => p.shadowRoot!.querySelector("strong")!)
      .filter((name) => name.getBoundingClientRect().width > 0)
    if (names.length !== 5) problems.push(`Expected 5 readable names; got ${names.length}`)
    names.forEach((name, i) => {
      const r = name.getBoundingClientRect()
      if (r.left < bounds.left || r.right > bounds.right) problems.push(`Name is clipped: ${name.textContent}`)
      const projected = (name.getRootNode() as ShadowRoot).host.closest(".stage")
      if (projected && (r.left < scene.left || r.right > scene.right || r.top < scene.top || r.bottom > scene.bottom))
        problems.push(`Projected name is clipped inside the stage: ${name.textContent}`)
      if (names.slice(i + 1).some((other) => {
        const b = other.getBoundingClientRect()
        return r.left < b.right && r.right > b.left && r.top < b.bottom && r.bottom > b.top
      })) problems.push(`Names overlap: ${name.textContent}`)
    })
    return problems
  })
}

/** "Skip ahead" vanishes when playback ends, so it can disappear between the check and the click. */
const skipIfPlaying = async (page: Page) => {
  if (await visible(page, "Skip ahead")) await page.getByRole("button", { name: "Skip ahead" }).first().click({ timeout: 1500 }).catch(() => undefined)
}

const dealToDrawing = async (page: Page) => {
  await click(page, /Deal a hand/)
  for (let i = 0; i < 40 && !(await visible(page, "Gain a card")); i++) {
    if (await visible(page, /^Match/)) await click(page, /^Match/)
    else if (await visible(page, "Check")) await click(page, "Check")
    else await page.waitForTimeout(100)
  }
  if (!(await visible(page, "Gain a card"))) throw new Error("Did not reach your drawing step")
}

const finishHand = async (page: Page) => {
  for (let i = 0; i < 60 && !(await inLobby(page)); i++) {
    for (const name of ["Check", /^Match/, "Stand", "Call the hand"])
      if (await visible(page, name)) {
        await click(page, name)
        break
      }
    await page.waitForTimeout(100)
  }
  if (!(await inLobby(page))) throw new Error("Hand did not reach showdown")
}

/** A genuine detach during playback must resume the same beat and restore usable controls. */
const reattachPlayback = async (page: Page, shot: Shot, tag: "sabacc-table" | "sabacc-3d") => {
  await click(page, /Deal a hand/)
  const before = await page.evaluate(async (tag) => {
    const el = document.querySelector(tag)
    const parent = el?.parentElement
    if (el === null || parent === undefined || parent === null) throw new Error(`Missing ${tag}`)
    const { run, shown, beats } = el.state.playback
    if (shown >= beats.length) throw new Error(`${tag} has no pending playback`)
    el.remove()
    // Teardown is deferred by a microtask; this turn makes it a removal, not a move.
    await new Promise((resolve) => setTimeout(resolve, 0))
    parent.append(el)
    return { tag, run, shown }
  }, tag)
  await page.waitForFunction(({ tag, run, shown }) => {
    const p = document.querySelector(tag)?.state.playback
    return p !== undefined && p.run === run && p.shown > shown
  }, before, { timeout: 10_000 })
  await shot(`${tag}-reattach-1-resumed`)
  await skipIfPlaying(page)
  await page.getByRole("button", { name: /^Check$|^Match/ }).first().waitFor()
  await shot(`${tag}-reattach-2-your-turn`)
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
  reattach: (page, shot) => reattachPlayback(page, shot, "sabacc-table"),
  "3d-reattach": (page, shot) => reattachPlayback(page, shot, "sabacc-3d"),
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
  // Native log disclosure, portrait/landscape resize, camera reset and a short phone.
  "3d-layout": async (page, shot) => {
    await page.emulateMedia({ reducedMotion: "reduce" })
    await dealToDrawing(page)
    await page.getByRole("group", { name: "Choose a card to lock or trade" }).getByRole("button").first().click()
    await page.waitForTimeout(800)
    await shot("3d-layout-1-drawing")
    const log = page.locator("sabacc-log summary")
    await log.click()
    await page.waitForTimeout(800)
    await shot("3d-layout-2-log-open")
    const viewport = page.viewportSize()!
    if (viewport.width <= 640) {
      for (const size of [{ width: 844, height: 390 }, { width: 320, height: 568 }, viewport]) {
        await page.setViewportSize(size)
        await click(page, "Reset view")
        await page.waitForTimeout(1500)
        await shot(`3d-layout-3-resize-${size.width}`)
      }
    }
    await log.click()
    await finishHand(page)
    await log.click()
    await page.waitForTimeout(800)
    await shot("3d-layout-4-showdown-log-open")
  },
  // Half the CSS viewport, double the pixel density: a 390x844 phone at 200% layout.
  "3d-zoom": async (page, shot) => {
    await page.emulateMedia({ reducedMotion: "reduce" })
    await dealToDrawing(page)
    const scene = page.locator("sabacc-stage")
    await scene.scrollIntoViewIfNeeded()
    await page.waitForTimeout(800)
    await shot("3d-zoom-1-table")
    await page.getByRole("group", { name: "Choose a card to lock or trade" }).getByRole("button").first().click()
    await page.getByRole("button", { name: "Stand", exact: true }).focus()
    await page.keyboard.press("Shift+Tab")
    await page.keyboard.press("Tab")
    if (!(await page.getByRole("button", { name: "Stand", exact: true }).evaluate((button) => button.matches(":focus-visible"))))
      throw new Error("Stand did not retain a visible keyboard focus indicator")
    const stand = await page.getByRole("button", { name: "Stand", exact: true }).boundingBox()
    if (stand === null || stand.x < 0 || stand.x + stand.width > 195 || stand.y < 0 || stand.y + stand.height > 422)
      throw new Error("Keyboard focus did not reveal Stand at 200% layout")
    await shot("3d-zoom-2-controls")
    const players = page.getByRole("region", { name: "Players", exact: true })
    await players.locator("li").first().scrollIntoViewIfNeeded()
    await shot("3d-zoom-3-players-top")
    await players.locator("li").last().scrollIntoViewIfNeeded()
    await shot("3d-zoom-4-players-bottom")
    await finishHand(page)
    await players.locator("li").first().scrollIntoViewIfNeeded()
    await shot("3d-zoom-5-results-top")
    await players.locator("li").last().scrollIntoViewIfNeeded()
    await shot("3d-zoom-6-results-bottom")
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
const browser = await chromium.launch({
  // Use the existing compositor surface for software-WebGL screenshots.
  ignoreDefaultArgs: ["--enable-features=CDPScreenshotNewSurface"],
  args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader"],
})
const report: Array<{ path: string; scheme: string; viewport: string; errors: ReadonlyArray<string> }> = []

for (const [name, run] of Object.entries(paths)) {
  if (values.path !== "all" && values.path !== name) continue
  if (name === "multiplayer") continue
  for (const scheme of ["dark", "light"] as const) {
    if (values.scheme !== "all" && values.scheme !== scheme) continue
    const viewports = name === "3d-zoom" ? [{ width: 195, height: 422 }] : [{ width: 1280, height: 900 }, { width: 390, height: 844 }]
    for (const viewport of viewports) {
      if (values.viewport !== "all" && values.viewport !== (viewport.width <= 640 ? "phone" : "desktop")) continue
      // Playback, reattachment and 3D paths keep real motion; other scripted paths skip it.
      const motion = name === "playback" || name === "reattach" || name.startsWith("3d")
      const page = await browser.newPage({ colorScheme: scheme, viewport, deviceScaleFactor: name === "3d-zoom" ? 2 : 1, reducedMotion: motion ? "no-preference" : "reduce" })
      const errors: Array<string> = []
      page.on("console", (m) => m.type() === "error" && errors.push(m.text()))
      page.on("pageerror", (e) => errors.push(e.message))
      const threeD = name.startsWith("3d")
      await page.goto(`${url}${threeD ? "3d.html" : ""}?seed=${values.seed}`)
      await page.locator(threeD ? "sabacc-3d" : "sabacc-table").getByRole("button").first().waitFor()
      if (threeD) await page.waitForTimeout(800)
      const tag = `${scheme}-${viewport.width}`
      await run(page, async (name) => {
        errors.push(...(await tableHudProblems(page)).map((problem) => `${name}: ${problem}`))
        return screenshot(page, join(out, `${name}-${tag}.png`), threeD)
      })
      report.push({ path: name, scheme, viewport: `${viewport.width}x${viewport.height}`, errors })
      console.log(`drive: ${name} ${tag}, ${errors.length} console/page/layout errors`)
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
  const shot = async (page: Page, name: string) => {
    errors.push(...(await tableHudProblems(page)).map((problem) => `${name}: ${problem}`))
    return screenshot(page, join(out, `mp-${name}.png`), (await page.locator("sabacc-3d").count()) > 0)
  }
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
    await lando.locator("sabacc-room summary").click()
    await lando.locator("sabacc-log summary").click()
    await lando.waitForTimeout(800)
    await shot(lando, "1-lando-room-log-open-3d")
    await lando.locator("sabacc-room summary").click()
    await click(han, /Deal a hand/)
    // The server starts the hand asynchronously; an old Lobby snapshot is not a result.
    await han.getByRole("button", { name: /Deal a hand/ }).waitFor({ state: "hidden" })
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
    if (!(await inLobby(han)) || !(await inLobby(lando))) throw new Error("Multiplayer hand did not reach showdown in both views")
    await han.waitForTimeout(1500)
    await shot(han, "3-han-result")
    await shot(lando, "3-lando-result-3d")
    await lando.locator("sabacc-room summary").click()
    for (const scheme of ["dark", "light"] as const) {
      await lando.emulateMedia({ colorScheme: scheme })
      await lando.waitForTimeout(800)
      await shot(lando, `4-lando-room-log-open-${scheme}-3d`)
    }
    await lando.setViewportSize({ width: 195, height: 422 })
    for (const scheme of ["dark", "light"] as const) {
      await lando.emulateMedia({ colorScheme: scheme })
      await lando.locator("sabacc-stage").scrollIntoViewIfNeeded()
      await lando.waitForTimeout(1500)
      await shot(lando, `5-lando-zoom-table-${scheme}-3d`)
      await lando.getByRole("region", { name: "Players", exact: true }).locator("li").last().scrollIntoViewIfNeeded()
      await shot(lando, `6-lando-zoom-players-${scheme}-3d`)
    }
    // The reserved desktop column must also contain the expanded multiplayer room.
    await lando.setViewportSize({ width: 1280, height: 900 })
    await click(lando, "Reset view")
    for (const scheme of ["dark", "light"] as const) {
      await lando.emulateMedia({ colorScheme: scheme })
      await lando.waitForTimeout(1500)
      await shot(lando, `7-lando-desktop-room-log-open-${scheme}-3d`)
    }
  } finally {
    report.push({ path: "multiplayer", scheme: "dark+light", viewport: "1280+390+195", errors })
    game.kill()
  }
}

await browser.close()
await new Promise<void>((resolve) => server.httpServer.close(() => resolve()))
writeFileSync(join(out, "report.json"), JSON.stringify(report, null, 2))
const failed = report.filter((r) => r.errors.length > 0)
console.log(`drive: ${report.length} runs, ${failed.length} with console/page/layout errors. Screenshots in .drive/`)
for (const r of failed) console.error(`${r.path} ${r.scheme} ${r.viewport}: ${r.errors.join(" | ")}`)
process.exitCode = failed.length === 0 ? 0 : 1
