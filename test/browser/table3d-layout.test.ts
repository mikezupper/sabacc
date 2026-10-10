import { settled } from "@gyral/core"
import { page } from "vitest/browser"
import { afterEach, describe, expect, it } from "vitest"
import { provideTable } from "../../src/components/table-driver.ts"
import { Command, YOU } from "../../src/domain/model.ts"
import { Sabacc3d } from "../../src/scene/sabacc-3d.ts"
import { cell } from "../../src/state/cell.ts"
import { createStore, type Presence, type Store } from "../../src/state/store.ts"
import "../../src/styles/global.css"

type Table3d = InstanceType<typeof Sabacc3d>
const root = (el: Element) => el.shadowRoot!
const frames = async () => {
  for (let i = 0; i < 2; i++) await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
}
const settle = async (el: Table3d) => {
  await settled()
  el.send({ _tag: "Skip" })
  await settled()
  await frames()
}
const intersects = (a: DOMRect, b: DOMRect) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top

/** Names may move into normal flow, but must stay readable at enlarged layouts. */
const readableNames = (el: Table3d) => {
  const bounds = el.getBoundingClientRect()
  const names = [...root(el).querySelectorAll("sabacc-plate")]
    .map((plate) => root(plate).querySelector("strong")!)
    .filter((name) => name.getBoundingClientRect().width > 0)
  expect(names).toHaveLength(5)
  return names.flatMap((name, i) => {
    const r = name.getBoundingClientRect()
    const problems: Array<string> = []
    if (r.left < bounds.left || r.right > bounds.right) problems.push(`${name.textContent}: clipped at the view edge`)
    const plate = name.getRootNode() as ShadowRoot
    const scene = plate.host.closest(".stage")?.getBoundingClientRect()
    if (scene && (r.left < scene.left || r.right > scene.right || r.top < scene.top || r.bottom > scene.bottom))
      problems.push(`${name.textContent}: clipped inside the stage`)
    if (names.slice(i + 1).some((other) => intersects(r, other.getBoundingClientRect())))
      problems.push(`${name.textContent}: overlaps another name`)
    return problems
  })
}

/** Compare the real CSS2D projection with the HUD, rather than just world coordinates. */
const clearOfHud = (el: Table3d) => {
  const side = root(el).querySelector(".side")!.getBoundingClientRect()
  const scene = root(el).querySelector(".stage")!.getBoundingClientRect()
  const plates = [...root(el).querySelectorAll(".stage sabacc-plate")].map((p) => root(p).querySelector(".plate")!)
  expect(plates).toHaveLength(5)
  return plates.flatMap((p) => {
    const r = p.getBoundingClientRect()
    const name = p.querySelector("strong")!.getBoundingClientRect()
    // The stage clips projected labels; only their visible bounds can cover the HUD.
    const visible = new DOMRect(
      Math.max(r.left, scene.left), Math.max(r.top, scene.top),
      Math.max(0, Math.min(r.right, scene.right) - Math.max(r.left, scene.left)),
      Math.max(0, Math.min(r.bottom, scene.bottom) - Math.max(r.top, scene.top)),
    )
    const problems: Array<string> = []
    const who = p.querySelector("strong")!.textContent
    if (visible.width === 0 || visible.height === 0) problems.push(`${who}: plate is fully clipped`)
    if (intersects(visible, side)) problems.push(`${who}: overlaps room/log`)
    if (name.left < scene.left || name.right > scene.right || name.top < scene.top || name.bottom > scene.bottom)
      problems.push(`${who}: name ${[name.left, name.top, name.right, name.bottom].map(Math.round)} outside stage ${[scene.left, scene.top, scene.right, scene.bottom].map(Math.round)}`)
    return problems
  })
}

const until = (store: Store, tag: "Drawing" | "CallWindow") => {
  for (let i = 0; i < 100; i++) {
    const game = store.game.get()
    if (game.phase._tag === "Lobby") {
      if (tag === "CallWindow") return
      throw new Error(`Hand ended before ${tag}`)
    }
    const step = game.phase.step
    if (step.toAct[0] === YOU && step._tag === tag) return
    const you = game.seats[YOU]!
    store.dispatch(step._tag === "Betting" ? (step.currentBet > you.roundBet ? Command.Match() : Command.Check()) : step._tag === "Drawing" ? Command.Stand() : Command.Pass())
  }
  throw new Error(`Did not reach ${tag}`)
}

afterEach(() => {
  document.body.replaceChildren()
  document.body.className = ""
  document.documentElement.style.removeProperty("color-scheme")
})

const mountDrawing = async (scheme: string, viewport = { width: 390, height: 844 }, seed = 42) => {
  await page.viewport(viewport.width, viewport.height)
  await frames()
  document.documentElement.style.colorScheme = scheme
  document.body.className = "stage-page"
  const store = createStore(seed)
  const host = document.createElement("main")
  provideTable(host, store)
  const el = document.createElement("sabacc-3d") as Table3d
  const title = document.createElement("h1")
  title.slot = "title"
  title.textContent = "Sabacc 3D"
  el.append(title)
  host.append(el)
  document.body.append(host)
  await settle(el)
  store.dispatch(Command.StartHand())
  until(store, "Drawing")
  await settle(el)
  const controls = root(el).querySelector("sabacc-controls")!
  root(controls).querySelector<HTMLButtonElement>('[aria-label="Choose a card to lock or trade"] button')!.click()
  await settle(el)
  const log = root(root(el).querySelector("sabacc-log")!).querySelector("details")!
  return { el, store, controls, log }
}

describe("3D desktop layout", () => {
  it.each(["light", "dark"])("keeps the replay badge and expanded log clear of names in %s", async (scheme) => {
    const { el, store, log } = await mountDrawing(scheme, { width: 1280, height: 900 })
    el.send({ _tag: "Motion", reduce: true })
    await settle(el)
    await expect.poll(() => clearOfHud(el), { timeout: 10_000 }).toEqual([])
    log.open = true
    await frames()
    await expect.poll(() => clearOfHud(el), { timeout: 10_000 }).toEqual([])

    until(store, "CallWindow")
    if (store.game.get().phase._tag === "Playing") store.dispatch(Command.CallHand())
    await settle(el)
    expect(store.game.get().phase._tag).toBe("Lobby")
    // Seed 42's showdown put Opponent 4 beneath the floating replay badge.
    await expect.poll(() => clearOfHud(el), { timeout: 10_000 }).toEqual([])
    expect(readableNames(el)).toEqual([])
    const seed = root(el).querySelector(".seed")!
    expect(seed.querySelector("data")?.textContent).toBe("42")
    expect(intersects(seed.getBoundingClientRect(), root(el).querySelector(".stage")!.getBoundingClientRect())).toBe(false)
    const replay = seed.querySelector("a")!
    expect(replay.getAttribute("href")).toBe("?seed=42")
    replay.focus()
    await frames()
    expect(replay.getBoundingClientRect().bottom).toBeLessThanOrEqual(900)
    log.open = false
    await frames()
    expect(clearOfHud(el)).toEqual([])
  }, 60_000)
})

describe("3D responsive layout", () => {
  it.each([{ width: 390, height: 844 }, { width: 1280, height: 900 }])("paints the shift banner above the canvas after its flash ends at $width", async (viewport) => {
    const { el, store } = await mountDrawing("dark", viewport, 14)
    store.dispatch(Command.Gain())
    expect(store.last.get().some((beat) => beat.event._tag === "Shifted")).toBe(true)
    await settle(el)
    const alert = root(el).querySelector<HTMLElement>('.shift[role="alert"]')!
    expect(alert).not.toBeNull()
    // The banner persists until the next move, beyond the decorative flash.
    for (const animation of alert.getAnimations()) animation.finish()
    await frames()
    const r = alert.getBoundingClientRect()
    expect(root(el).elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)).toBe(alert)
  }, 60_000)

  it.each(["light", "dark"])("keeps all names readable and controls usable at 200 percent phone layout in %s", async (scheme) => {
    const { el, store, controls, log } = await mountDrawing(scheme)
    el.send({ _tag: "Motion", reduce: true })
    await settled()
    // 390x844 at 200% browser zoom has a 195x422 CSS viewport.
    await page.viewport(195, 422)
    log.open = true
    await frames()
    el.send({ _tag: "ResetView" })
    await settled()
    await expect.poll(() => readableNames(el), { timeout: 10_000 }).toEqual([])

    const players = root(el).querySelector(".players")!
    const names = [...players.querySelectorAll("sabacc-plate")].map((p) => root(p).querySelector("strong")!)
    expect(names).toHaveLength(5)
    expect(names.every((name) => parseFloat(getComputedStyle(name).fontSize) >= 12)).toBe(true)
    expect(root(players.querySelector("sabacc-plate")!).querySelector(".plate.active")?.textContent).toContain("You")
    const markers = [...root(el).querySelectorAll(".stage sabacc-plate")].map((p) => root(p).querySelector(".seat-marker")!)
    expect(markers.map((m) => m.textContent)).toEqual(["1", "2", "3", "4", "5"])
    expect(markers.every((m) => m.getBoundingClientRect().width > 0)).toBe(true)

    // Maximum protocol length, without spaces: the full name must wrap, not truncate.
    const longName = "ABCDEFGHIJKLMNOPQRSTUVWX"
    store.dispatch(Command.Control({ seat: 2, controller: "Ai", name: longName }))
    await settle(el)
    expect(root(players.querySelectorAll("sabacc-plate")[2]!).querySelector("bdi")?.textContent).toBe(longName)
    expect(readableNames(el)).toEqual([])

    const scene = root(el).querySelector("sabacc-stage")!
    expect(scene.getBoundingClientRect().height).toBeGreaterThanOrEqual(256)
    expect(scene.stage!.renderer.info.render.calls).toBeGreaterThan(0)
    const stand = [...root(controls).querySelectorAll("button")].find((b) => b.textContent?.trim() === "Stand")!
    stand.focus()
    await frames()
    const button = stand.getBoundingClientRect()
    expect(button.top).toBeGreaterThanOrEqual(0)
    expect(button.bottom).toBeLessThanOrEqual(422)
    expect(button.left).toBeGreaterThanOrEqual(0)
    expect(button.right).toBeLessThanOrEqual(195)

    until(store, "CallWindow")
    if (store.game.get().phase._tag === "Playing") store.dispatch(Command.CallHand())
    await settle(el)
    expect(store.game.get().phase._tag).toBe("Lobby")
    await expect.poll(() => readableNames(el), { timeout: 10_000 }).toEqual([])
    expect([...players.querySelectorAll("sabacc-plate")].some((p) => root(p).querySelector(".plate.winner") !== null)).toBe(true)
    store.dispatch(Command.Control({ seat: 2, controller: "Ai", name: "Opponent 2" }))
    store.dispatch(Command.NewTable())
    await settle(el)
    await page.viewport(390, 844)
    el.scrollTop = 0
    await frames()
    el.send({ _tag: "ResetView" })
    await settled()
    await expect.poll(() => clearOfHud(el), { timeout: 10_000 }).toEqual([])
  }, 60_000)

  it.each([{ width: 390, height: 844 }, { width: 1280, height: 900 }])("keeps the multiplayer join form above the canvas and accepts a real pointer click at $width", async ({ width, height }) => {
    await page.viewport(width, height)
    document.body.className = "stage-page"
    let joined = ""
    const store: Store = {
      ...createStore(42),
      room: {
        code: "ABCDEF", connection: cell("naming" as const), spectator: cell(false), host: cell(false),
        presence: cell<Presence>({ connected: [], deadline: undefined }), problem: cell<string | undefined>(undefined),
        name: cell(""), join: (name) => { joined = name },
      },
    }
    const host = document.createElement("main")
    provideTable(host, store)
    const el = new Sabacc3d()
    host.append(el)
    document.body.append(host)
    await settled()
    await frames()
    const room = root(el).querySelector("sabacc-room")!
    const button = root(room).querySelector("button")!
    const r = button.getBoundingClientRect()
    expect(root(el).elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)).toBe(room)
    await page.getByRole("textbox", { name: "Your name" }).fill("Lando")
    await page.getByRole("button", { name: "Join the table" }).click()
    await expect.poll(() => joined).toBe("Lando")
  }, 60_000)

  // Full-page WebGL setup plus several viewport changes needs more time than a
  // component probe under SwiftShader on the shared dev/CI machine.
  it.each(["light", "dark"])("keeps the room/log clear of player plates in the %s theme", async (scheme) => {
    const { el, store, log } = await mountDrawing(scheme)
    // Seed 42 at this drawing step reproduced the overlap with Opponent 2/3.
    await expect.poll(() => clearOfHud(el)).toEqual([])
    log.open = true
    await frames()
    await expect.poll(() => clearOfHud(el)).toEqual([])
    expect(root(el).querySelector(".stage")!.getBoundingClientRect().height).toBeGreaterThanOrEqual(256)
    const panel = root(el).querySelector(".panel")!.getBoundingClientRect()
    expect(panel.bottom).toBeLessThanOrEqual(844)

    until(store, "CallWindow")
    if (store.game.get().phase._tag === "Playing") store.dispatch(Command.CallHand())
    await settle(el)
    expect(store.game.get().phase._tag).toBe("Lobby")
    await expect.poll(() => clearOfHud(el), { timeout: 10_000 }).toEqual([])
    log.open = false
    await frames()
    await expect.poll(() => clearOfHud(el), { timeout: 10_000 }).toEqual([])
  }, 60_000)

  it("keeps names readable after resize/reset and makes short-screen controls reachable by keyboard", async () => {
    const { el, controls, log } = await mountDrawing("dark")
    log.open = true
    await frames()

    // Resize and reset while the log is open, then return to portrait.
    await page.viewport(844, 390)
    el.send({ _tag: "ResetView" })
    await settled()
    await frames()
    await expect.poll(() => clearOfHud(el), { timeout: 10_000 }).toEqual([])
    await page.viewport(390, 844)
    await frames()
    el.send({ _tag: "ResetView" })
    await settled()
    // The camera eases back after resizing, including under software WebGL in CI.
    await expect.poll(() => clearOfHud(el), { timeout: 10_000 }).toEqual([])

    await page.viewport(320, 568)
    await frames()
    el.send({ _tag: "ResetView" })
    await settled()
    await expect.poll(() => clearOfHud(el), { timeout: 10_000 }).toEqual([])
    expect(root(el).querySelector(".side")!.getBoundingClientRect().height).toBeGreaterThanOrEqual(96)
    const stand = [...root(controls).querySelectorAll("button")].find((b) => b.textContent?.trim() === "Stand")!
    stand.focus()
    await frames()
    expect(stand.getBoundingClientRect().bottom).toBeLessThanOrEqual(568)
    el.scrollTop = 0
    await page.viewport(390, 844)
    await frames()
    el.send({ _tag: "ResetView" })
    await settled()
    await expect.poll(() => clearOfHud(el), { timeout: 10_000 }).toEqual([])
  }, 60_000)
})
