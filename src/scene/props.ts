// Static and simple dynamic props: the table, chip stacks, the deck, dice, the dealer
// button and the turn ring.
import * as THREE from "three"
import { CARD_H, CARD_W, chipsFor, DENOMINATIONS, TABLE_RADIUS } from "./layout.ts"
import { approach } from "./motion.ts"
import { backTexture, chipTexture, dealerTexture, dieTextures, feltTexture } from "./textures.ts"

export const buildTable = (seats: number): THREE.Group => {
  const g = new THREE.Group()
  const felt = new THREE.Mesh(
    new THREE.CircleGeometry(TABLE_RADIUS, 128).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ map: feltTexture(seats), roughness: 0.92, metalness: 0 }),
  )
  felt.receiveShadow = true
  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(TABLE_RADIUS + 0.12, 0.26, 24, 160).rotateX(Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x8a6a2f, roughness: 0.3, metalness: 0.85 }),
  )
  rim.position.y = 0.04
  rim.castShadow = true
  rim.receiveShadow = true
  const glowRing = new THREE.Mesh(
    new THREE.TorusGeometry(TABLE_RADIUS + 0.12, 0.035, 8, 160).rotateX(Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x4fd8f0, transparent: true, opacity: 0.55 }),
  )
  glowRing.position.y = -0.2
  glowRing.name = "glow-ring"
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(TABLE_RADIUS + 0.1, TABLE_RADIUS - 0.5, 0.6, 96, 1, true),
    new THREE.MeshStandardMaterial({ color: 0x241c33, roughness: 0.6, metalness: 0.4, side: THREE.DoubleSide }),
  )
  body.position.y = -0.3
  const stem = new THREE.Mesh(
    new THREE.CylinderGeometry(0.9, 1.6, 3.2, 48),
    new THREE.MeshStandardMaterial({ color: 0x1a1426, roughness: 0.5, metalness: 0.6 }),
  )
  stem.position.y = -2.2
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(30, 64).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x0d0a16, roughness: 0.85, metalness: 0.1 }),
  )
  floor.position.y = -3.8
  floor.receiveShadow = true
  g.add(felt, rim, glowRing, body, stem, floor)
  return g
}

const chipGeometry = new THREE.CylinderGeometry(0.17, 0.17, 0.05, 32)
const chipMaterials = new Map<number, ReadonlyArray<THREE.Material>>()
const chipMaterial = (denomination: number): ReadonlyArray<THREE.Material> => {
  const hit = chipMaterials.get(denomination)
  if (hit !== undefined) return hit
  const color = DENOMINATIONS[denomination]?.color ?? 0xd6453a
  const top = new THREE.MeshStandardMaterial({ map: chipTexture(color), roughness: 0.4, metalness: 0.1 })
  const side = new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.1 })
  const mats = [side, top, top]
  chipMaterials.set(denomination, mats)
  return mats
}

export const chipMesh = (denomination: number): THREE.Mesh => {
  const m = new THREE.Mesh(chipGeometry, [...chipMaterial(denomination)])
  m.castShadow = true
  m.receiveShadow = true
  return m
}

/** A pile of chips for an amount, in columns of up to 10, that grows and shrinks. */
export class ChipStack {
  readonly group = new THREE.Group()
  private amount = -1

  set(amount: number): boolean {
    if (amount === this.amount) return false
    this.amount = amount
    this.group.clear()
    const chips = chipsFor(amount)
    // Columns by denomination, so the pile reads as value at a glance.
    const columns: Array<Array<number>> = []
    for (const d of chips) {
      const col = columns.at(-1)
      if (col !== undefined && col[0] === d && col.length < 10) col.push(d)
      else columns.push([d])
    }
    columns.forEach((col, ci) => {
      const angle = ci * 2.4
      const r = ci === 0 ? 0 : 0.2 + 0.07 * ci
      col.forEach((d, i) => {
        const m = chipMesh(d)
        m.position.set(Math.cos(angle) * r, 0.025 + i * 0.052, Math.sin(angle) * r)
        m.rotation.y = (i * 0.7) % (Math.PI * 2)
        this.group.add(m)
      })
    })
    return true
  }
}

/** The face-down deck; its height follows the number of cards left. */
export class Deck {
  readonly group = new THREE.Group()
  private readonly body: THREE.Mesh
  private size = -1

  constructor() {
    const top = new THREE.MeshStandardMaterial({ map: backTexture(), roughness: 0.45, metalness: 0.15 })
    const side = new THREE.MeshStandardMaterial({ color: 0x3a3060, roughness: 0.7, metalness: 0.2 })
    this.body = new THREE.Mesh(new THREE.BoxGeometry(CARD_W, 1, CARD_H), [side, side, top, side, side, side])
    this.body.castShadow = true
    this.body.receiveShadow = true
    this.group.add(this.body)
  }

  set(cards: number): void {
    if (cards === this.size) return
    this.size = cards
    const h = Math.max(cards, 0) * 0.006 + 0.001
    this.body.visible = cards > 0
    this.body.scale.y = h
    this.body.position.y = h / 2
  }

  get height(): number {
    return this.body.scale.y
  }
}

/** Box face order is +x, −x, +y, −y, +z, −z; opposite faces sum to 7. */
const FACE_VALUES = [1, 6, 2, 5, 3, 4] as const

/** Rotation that puts `value` on top. */
export const dieRestQuat = (value: number, yaw: number): THREE.Quaternion => {
  const e = new THREE.Euler()
  switch (value) {
    case 1:
      e.set(0, 0, Math.PI / 2)
      break
    case 6:
      e.set(0, 0, -Math.PI / 2)
      break
    case 5:
      e.set(Math.PI, 0, 0)
      break
    case 3:
      e.set(-Math.PI / 2, 0, 0)
      break
    case 4:
      e.set(Math.PI / 2, 0, 0)
      break
    default:
      e.set(0, 0, 0)
  }
  return new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw).multiply(new THREE.Quaternion().setFromEuler(e))
}

export const makeDie = (): THREE.Mesh => {
  const tex = dieTextures()
  const mats = FACE_VALUES.map((v) => new THREE.MeshStandardMaterial({ map: tex[v - 1] ?? null, roughness: 0.35, metalness: 0.05 }))
  const die = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.34), mats)
  die.castShadow = true
  return die
}

export const makeDealerButton = (): THREE.Mesh => {
  const face = new THREE.MeshStandardMaterial({ map: dealerTexture(), roughness: 0.4 })
  const side = new THREE.MeshStandardMaterial({ color: 0xd8d0bc, roughness: 0.5 })
  // Cap UVs run along z; turn the disc so the "D" reads upright from your seat.
  const m = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.07, 40).rotateY(Math.PI / 2), [side, face, side])
  m.castShadow = true
  return m
}

/** A glowing ring on the felt in front of whoever is to act. */
export class TurnRing {
  readonly mesh: THREE.Mesh
  private readonly mat: THREE.MeshBasicMaterial
  readonly target = new THREE.Vector3()
  shown = false

  constructor() {
    this.mat = new THREE.MeshBasicMaterial({ color: 0x4fd8f0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })
    this.mesh = new THREE.Mesh(new THREE.RingGeometry(1.25, 1.34, 96).rotateX(-Math.PI / 2), this.mat)
    this.mesh.position.y = 0.012
  }

  step(dt: number, time: number): void {
    const k = approach(6, dt)
    this.mesh.position.x += (this.target.x - this.mesh.position.x) * k
    this.mesh.position.z += (this.target.z - this.mesh.position.z) * k
    const want = this.shown ? 0.55 + 0.25 * Math.sin(time * 4) : 0
    this.mat.opacity += (want - this.mat.opacity) * approach(8, dt)
    this.mesh.scale.setScalar(1 + 0.02 * Math.sin(time * 4))
  }
}
