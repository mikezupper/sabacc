// One card on the 3D table: a two-sided rounded plate with a glow underlay for the
// interference field, your selection and the pointer.
import * as THREE from "three"
import type { Card } from "../domain/cards.ts"
import { CARD_H, CARD_W } from "./layout.ts"
import { Mover } from "./motion.ts"
import { backTexture, faceTexture } from "./textures.ts"

const roundedRect = (w: number, h: number, r: number): THREE.Shape => {
  const s = new THREE.Shape()
  const x = -w / 2
  const y = -h / 2
  s.moveTo(x + r, y)
  s.lineTo(x + w - r, y)
  s.quadraticCurveTo(x + w, y, x + w, y + r)
  s.lineTo(x + w, y + h - r)
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  s.lineTo(x + r, y + h)
  s.quadraticCurveTo(x, y + h, x, y + h - r)
  s.lineTo(x, y + r)
  s.quadraticCurveTo(x, y, x + r, y)
  return s
}

/** A flat rounded rectangle in the XZ plane facing +y, with 0…1 UVs (top of texture at −z). */
const plate = (w: number, h: number, r: number): THREE.BufferGeometry => {
  const g = new THREE.ShapeGeometry(roundedRect(w, h, r), 6)
  const pos = g.attributes["position"]
  const uv = g.attributes["uv"]
  if (pos !== undefined && uv !== undefined)
    for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / w + 0.5, pos.getY(i) / h + 0.5)
  g.rotateX(-Math.PI / 2)
  return g
}

let shared: { face: THREE.BufferGeometry; back: THREE.BufferGeometry; glow: THREE.BufferGeometry } | undefined
const geometry = () => {
  if (shared !== undefined) return shared
  const face = plate(CARD_W, CARD_H, 0.07)
  face.translate(0, 0.004, 0)
  // The back faces −y; mirrored left-right so it reads the same from below.
  const back = plate(CARD_W, CARD_H, 0.07)
  back.rotateZ(Math.PI)
  back.translate(0, -0.004, 0)
  const glow = plate(CARD_W + 0.16, CARD_H + 0.16, 0.13)
  glow.translate(0, -0.006, 0)
  shared = { face, back, glow }
  return shared
}

export type Glow = "none" | "field" | "selected" | "hover" | "winner"

const GLOW: Record<Exclude<Glow, "none">, number> = {
  field: 0x4fd8f0,
  selected: 0xffc94a,
  hover: 0xfff1c4,
  winner: 0xffc94a,
}

export class CardView {
  readonly group = new THREE.Group()
  readonly mover = new Mover()
  private readonly faceMat: THREE.MeshStandardMaterial
  private readonly backMat: THREE.MeshStandardMaterial
  private readonly glowMat: THREE.MeshBasicMaterial
  private readonly glowMesh: THREE.Mesh
  private glowKind: Glow = "none"
  card: Card
  /** The card id this object stands for (a shift hands the object to the new card). */
  private key: number
  /** Leaving play (traded, discarded, new hand): fading out on the discard pile. */
  leaving = false
  /** Extra local rotation and lift while a shift spins the card. */
  readonly spin = new THREE.Quaternion()
  spinLift = 0
  private faceShown = false

  constructor(card: Card) {
    this.card = card
    this.key = card.id
    const g = geometry()
    this.faceMat = new THREE.MeshStandardMaterial({ map: backTexture(), roughness: 0.45, metalness: 0.05, transparent: true })
    this.backMat = new THREE.MeshStandardMaterial({ map: backTexture(), roughness: 0.4, metalness: 0.2, transparent: true })
    this.glowMat = new THREE.MeshBasicMaterial({ color: GLOW.field, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })
    const face = new THREE.Mesh(g.face, this.faceMat)
    const back = new THREE.Mesh(g.back, this.backMat)
    face.castShadow = true
    back.castShadow = true
    face.receiveShadow = true
    this.glowMesh = new THREE.Mesh(g.glow, this.glowMat)
    this.glowMesh.visible = false
    this.group.add(face, back, this.glowMesh)
    this.rekey(card.id)
  }

  get id(): number {
    return this.key
  }

  /** Stand for another card id (a shift replaces the card in place). */
  rekey(id: number): void {
    this.key = id
    this.group.traverse((o) => (o.userData["cardId"] = id))
  }

  /** Show the design (only cards the viewer may see carry their face texture). */
  show(card: Card, faceVisible: boolean): void {
    if (card === this.card && faceVisible === this.faceShown) return
    this.card = card
    this.faceShown = faceVisible
    this.faceMat.map = faceVisible ? faceTexture(card) : backTexture()
    this.faceMat.needsUpdate = true
  }

  setGlow(kind: Glow): void {
    this.glowKind = kind
    this.glowMesh.visible = kind !== "none"
    if (kind !== "none") this.glowMat.color.setHex(GLOW[kind])
  }

  set opacity(v: number) {
    this.faceMat.opacity = v
    this.backMat.opacity = v
  }

  /** Per frame: motion, then shift spin, then the glow's pulse. */
  step(dt: number, time: number): void {
    this.mover.step(dt, this.group)
    this.group.quaternion.multiply(this.spin)
    this.group.position.y += this.spinLift
    if (this.glowKind !== "none") {
      const pulse = this.glowKind === "field" ? 0.45 + 0.25 * Math.sin(time * 3 + this.card.id) : this.glowKind === "hover" ? 0.35 : 0.8
      this.glowMat.opacity = pulse
    }
  }

  dispose(): void {
    this.faceMat.dispose()
    this.backMat.dispose()
    this.glowMat.dispose()
  }
}
