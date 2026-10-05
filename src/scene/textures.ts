// Procedural textures drawn on canvases: card faces and back, felt, dice, chips.
// No image assets, so the 3D view ships as code only. Card faces follow the 2D
// <sabacc-card> design: value in the middle, suit mark, full names for face cards.
import * as THREE from "three"
import { cardTitle, type Card, type Suit } from "../domain/cards.ts"

const DISPLAY = `ui-rounded, "Arial Rounded MT Bold", system-ui, sans-serif`
const BODY = `system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`

const canvas = (w: number, h: number): readonly [HTMLCanvasElement, CanvasRenderingContext2D] => {
  const c = document.createElement("canvas")
  c.width = w
  c.height = h
  const ctx = c.getContext("2d")
  if (ctx === null) throw new Error("2D canvas is unavailable")
  return [c, ctx]
}

const texture = (c: HTMLCanvasElement, anisotropy = 8): THREE.CanvasTexture => {
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = anisotropy
  return t
}

const roundRect = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
}

const suitPath = (ctx: CanvasRenderingContext2D, suit: Suit, cx: number, cy: number, s: number) => {
  ctx.beginPath()
  switch (suit) {
    case "Flasks":
      ctx.moveTo(cx - s, cy + s)
      ctx.lineTo(cx, cy - s)
      ctx.lineTo(cx + s, cy + s)
      ctx.closePath()
      break
    case "Sabers":
      ctx.moveTo(cx, cy - s * 1.2)
      ctx.lineTo(cx + s * 0.8, cy)
      ctx.lineTo(cx, cy + s * 1.2)
      ctx.lineTo(cx - s * 0.8, cy)
      ctx.closePath()
      break
    case "Staves":
      ctx.roundRect(cx - s * 0.32, cy - s * 1.2, s * 0.64, s * 2.4, s * 0.2)
      break
    case "Coins":
      ctx.arc(cx, cy, s, 0, Math.PI * 2)
      break
  }
}

const W = 256
const H = 384

/** Edge colour by kind, as in the 2D cards: suited green, face red, the Idiot gold. */
const edgeColor = (c: Card): string => (c._tag === "Suited" ? "#3fbf74" : c.value === 0 ? "#e6b84a" : "#e0564b")

const wrap = (name: string, width = 13): ReadonlyArray<string> =>
  name.split(" ").reduce<ReadonlyArray<string>>((lines, word) => {
    const last = lines.at(-1)
    return last !== undefined && `${last} ${word}`.length <= width ? [...lines.slice(0, -1), `${last} ${word}`] : [...lines, word]
  }, [])

const signed = (n: number): string => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : "0")

const drawFace = (c: Card): HTMLCanvasElement => {
  const [cv, ctx] = canvas(W, H)
  const edge = edgeColor(c)
  // Body: a pale hologram plate with a coloured rim.
  const g = ctx.createLinearGradient(0, 0, W, H)
  g.addColorStop(0, "#f7f3e8")
  g.addColorStop(1, "#e3ddcf")
  roundRect(ctx, 4, 4, W - 8, H - 8, 26)
  ctx.fillStyle = g
  ctx.fill()
  ctx.lineWidth = 9
  ctx.strokeStyle = edge
  ctx.stroke()
  roundRect(ctx, 20, 20, W - 40, H - 40, 16)
  ctx.lineWidth = 2
  ctx.strokeStyle = `${edge}88`
  ctx.stroke()

  const value = signed(c.value)
  const corner = c._tag === "Suited" ? (c.value > 11 ? cardTitle(c).slice(0, 2) : String(c.value)) : value
  ctx.fillStyle = "#1d1830"
  ctx.font = `600 34px ${BODY}`
  ctx.textAlign = "left"
  ctx.textBaseline = "alphabetic"
  ctx.fillText(corner, 30, 62)
  ctx.save()
  ctx.translate(W - 30, H - 30)
  ctx.rotate(Math.PI)
  ctx.fillText(corner, 0, 32)
  ctx.restore()

  ctx.font = `700 92px ${DISPLAY}`
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  ctx.fillText(value, W / 2, H * 0.44)

  ctx.fillStyle = edge
  if (c._tag === "Suited") {
    suitPath(ctx, c.suit, 44, 96, 13)
    ctx.fill()
  }
  const lines = c._tag === "Face" ? wrap(c.name) : c.value > 11 ? [cardTitle(c)] : []
  if (lines.length > 0) {
    ctx.font = `700 27px ${BODY}`
    lines.forEach((line, i) => ctx.fillText(line, W / 2, H * 0.68 + i * 32))
  } else if (c._tag === "Suited") {
    suitPath(ctx, c.suit, W / 2, H * 0.72, 26)
    ctx.fill()
  }
  if (c._tag === "Suited") {
    ctx.font = `600 20px ${BODY}`
    ctx.fillStyle = "#1d183099"
    ctx.fillText(c.suit.toUpperCase(), W / 2, H - 46)
  }
  return cv
}

const designKey = (c: Card): string => (c._tag === "Suited" ? `${c.suit}:${c.value}` : c.name)

const faces = new Map<string, THREE.CanvasTexture>()

/** The face texture for a card's design (cached: two copies of a card share it). */
export const faceTexture = (c: Card): THREE.CanvasTexture => {
  const key = designKey(c)
  const hit = faces.get(key)
  if (hit !== undefined) return hit
  const t = texture(drawFace(c))
  faces.set(key, t)
  return t
}

let back: THREE.CanvasTexture | undefined

export const backTexture = (): THREE.CanvasTexture => {
  if (back !== undefined) return back
  const [cv, ctx] = canvas(W, H)
  const g = ctx.createRadialGradient(W / 2, H / 2, 10, W / 2, H / 2, H * 0.7)
  g.addColorStop(0, "#2b2350")
  g.addColorStop(1, "#120e26")
  roundRect(ctx, 4, 4, W - 8, H - 8, 26)
  ctx.fillStyle = g
  ctx.fill()
  ctx.lineWidth = 8
  ctx.strokeStyle = "#e6b84a"
  ctx.stroke()
  ctx.strokeStyle = "#e6b84acc"
  ctx.lineWidth = 5
  ctx.beginPath()
  ctx.moveTo(46, 46)
  ctx.lineTo(W - 46, H - 46)
  ctx.moveTo(W - 46, 46)
  ctx.lineTo(46, H - 46)
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(W / 2, H / 2, 52, 0, Math.PI * 2)
  ctx.fillStyle = "#1a1436"
  ctx.fill()
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(W / 2, H / 2, 30, 0, Math.PI * 2)
  ctx.strokeStyle = "#5fd4e8"
  ctx.lineWidth = 3
  ctx.stroke()
  back = texture(cv)
  return back
}

/** The felt: deep teal cloth, gold inlay rings, a betting circle per seat. */
export const feltTexture = (seats: number): THREE.CanvasTexture => {
  const S = 2048
  const [cv, ctx] = canvas(S, S)
  const c = S / 2
  const g = ctx.createRadialGradient(c, c, S * 0.05, c, c, S * 0.5)
  g.addColorStop(0, "#1f5a55")
  g.addColorStop(0.75, "#123b3b")
  g.addColorStop(1, "#0a2426")
  ctx.fillStyle = g
  ctx.fillRect(0, 0, S, S)
  // Cloth grain.
  const grain = ctx.createImageData(S, S)
  for (let i = 0; i < grain.data.length; i += 4) {
    const n = Math.random() * 22
    grain.data[i] = n
    grain.data[i + 1] = n
    grain.data[i + 2] = n
    grain.data[i + 3] = 26
  }
  const [gc, gctx] = canvas(S, S)
  gctx.putImageData(grain, 0, 0)
  ctx.drawImage(gc, 0, 0)

  const ring = (r: number, w: number, color: string, dash: ReadonlyArray<number> = []) => {
    ctx.beginPath()
    ctx.setLineDash([...dash])
    ctx.arc(c, c, r * c, 0, Math.PI * 2)
    ctx.lineWidth = w
    ctx.strokeStyle = color
    ctx.stroke()
    ctx.setLineDash([])
  }
  ring(0.97, 10, "#c9a04866")
  ring(0.93, 3, "#c9a04855")
  ring(0.36, 6, "#c9a04877")
  ring(0.33, 2, "#5fd4e855", [18, 14])

  // Canvas is a top view: right = +x, down = +z (the felt is a CircleGeometry laid flat).
  // Seat zones: an arc of inlay in front of each seat.
  for (let i = 0; i < seats; i++) {
    const a = (i * 2 * Math.PI) / seats
    const dir = Math.atan2(Math.cos(a), -Math.sin(a))
    ctx.beginPath()
    ctx.arc(c, c, 0.66 * c, dir - 0.36, dir + 0.36)
    ctx.lineWidth = 4
    ctx.strokeStyle = "#c9a04866"
    ctx.stroke()
  }

  // Centre emblem: an eight-pointed star.
  ctx.save()
  ctx.translate(c, c)
  ctx.beginPath()
  for (let i = 0; i < 16; i++) {
    const r = i % 2 === 0 ? 0.2 * c : 0.08 * c
    const a = (i * Math.PI) / 8
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r)
  }
  ctx.closePath()
  ctx.fillStyle = "#c9a04818"
  ctx.fill()
  ctx.strokeStyle = "#c9a04840"
  ctx.lineWidth = 3
  ctx.stroke()
  ctx.font = `700 64px ${DISPLAY}`
  ctx.fillStyle = "#c9a04870"
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  const word = "SABACC"
  // Along the far side of the inner ring, upright as seen from your seat.
  ;[...word].forEach((ch, i) => {
    ctx.save()
    ctx.rotate(-0.5 + i / (word.length - 1))
    ctx.fillText(ch, 0, -0.47 * c)
    ctx.restore()
  })
  ctx.restore()
  return texture(cv, 16)
}

/** Dice faces 1–6: dark metal with glowing pips. */
export const dieTextures = (): ReadonlyArray<THREE.CanvasTexture> => {
  const pips: Record<number, ReadonlyArray<readonly [number, number]>> = {
    1: [[0.5, 0.5]],
    2: [[0.27, 0.27], [0.73, 0.73]],
    3: [[0.27, 0.27], [0.5, 0.5], [0.73, 0.73]],
    4: [[0.27, 0.27], [0.73, 0.27], [0.27, 0.73], [0.73, 0.73]],
    5: [[0.27, 0.27], [0.73, 0.27], [0.5, 0.5], [0.27, 0.73], [0.73, 0.73]],
    6: [[0.27, 0.25], [0.73, 0.25], [0.27, 0.5], [0.73, 0.5], [0.27, 0.75], [0.73, 0.75]],
  }
  return [1, 2, 3, 4, 5, 6].map((n) => {
    const [cv, ctx] = canvas(128, 128)
    ctx.fillStyle = "#e9e3d3"
    ctx.fillRect(0, 0, 128, 128)
    ctx.strokeStyle = "#b9ae94"
    ctx.lineWidth = 6
    ctx.strokeRect(3, 3, 122, 122)
    ctx.fillStyle = n === 1 ? "#c7372f" : "#1d1830"
    for (const [x, y] of pips[n] ?? []) {
      ctx.beginPath()
      ctx.arc(x * 128, y * 128, n === 1 ? 17 : 11, 0, Math.PI * 2)
      ctx.fill()
    }
    return texture(cv, 4)
  })
}

/** A chip's top: coloured disc with a dashed white edge band. */
export const chipTexture = (color: number): THREE.CanvasTexture => {
  const [cv, ctx] = canvas(128, 128)
  const hex = `#${color.toString(16).padStart(6, "0")}`
  ctx.fillStyle = hex
  ctx.fillRect(0, 0, 128, 128)
  ctx.beginPath()
  ctx.arc(64, 64, 52, 0, Math.PI * 2)
  ctx.setLineDash([16, 12])
  ctx.lineWidth = 12
  ctx.strokeStyle = "#f4efe2"
  ctx.stroke()
  ctx.setLineDash([])
  ctx.beginPath()
  ctx.arc(64, 64, 30, 0, Math.PI * 2)
  ctx.lineWidth = 3
  ctx.strokeStyle = "#f4efe2aa"
  ctx.stroke()
  return texture(cv, 4)
}

/** The dealer button's face. */
export const dealerTexture = (): THREE.CanvasTexture => {
  const [cv, ctx] = canvas(128, 128)
  ctx.fillStyle = "#f4efe2"
  ctx.fillRect(0, 0, 128, 128)
  ctx.fillStyle = "#1d1830"
  ctx.font = `800 64px ${DISPLAY}`
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  ctx.fillText("D", 64, 68)
  return texture(cv, 4)
}
