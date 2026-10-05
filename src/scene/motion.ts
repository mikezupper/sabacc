// Motion for the 3D view. Objects ease towards a target placement (so any snapshot
// change animates by itself), and one-off effects run as timed tweens. Nothing here
// holds game state: targets are recomputed from each snapshot.
import * as THREE from "three"
import type { Placement } from "./layout.ts"

const EULER = new THREE.Euler(0, 0, 0, "YXZ")

export const quatOf = (p: Pick<Placement, "yaw" | "pitch" | "roll">, out = new THREE.Quaternion()): THREE.Quaternion =>
  out.setFromEuler(EULER.set(p.pitch, p.yaw, p.roll, "YXZ"))

/** Exponential approach: frame-rate independent smoothing factor for `rate` per second. */
export const approach = (rate: number, dt: number): number => 1 - Math.exp(-rate * dt)

/**
 * Eases an object to a target placement. Long moves lift into an arc so cards fly
 * over the table rather than through it. `delay` holds the object where it is first.
 */
export class Mover {
  readonly position = new THREE.Vector3()
  readonly quaternion = new THREE.Quaternion()
  scale = 1
  readonly target = new THREE.Vector3()
  readonly targetQuat = new THREE.Quaternion()
  targetScale = 1
  delay = 0
  rate = 7
  arc = 0.32

  place(p: Placement): void {
    this.target.set(p.x, p.y, p.z)
    quatOf(p, this.targetQuat)
    this.targetScale = p.scale
  }

  snap(): void {
    this.position.copy(this.target)
    this.quaternion.copy(this.targetQuat)
    this.scale = this.targetScale
    this.delay = 0
  }

  /** Remaining distance to the target. */
  get distance(): number {
    return this.position.distanceTo(this.target)
  }

  /** Advance by `dt` seconds and write the result into `obj`. */
  step(dt: number, obj: THREE.Object3D): void {
    if (this.delay > 0) this.delay -= dt
    else {
      const k = approach(this.rate, dt)
      this.position.lerp(this.target, k)
      this.quaternion.slerp(this.targetQuat, k)
      this.scale += (this.targetScale - this.scale) * k
    }
    obj.position.copy(this.position)
    obj.position.y += Math.min(this.distance * this.arc, 0.9)
    obj.quaternion.copy(this.quaternion)
    obj.scale.setScalar(this.scale)
  }
}

export interface Tween {
  readonly duration: number
  /** Called each frame with progress 0…1 (eased by the tween itself if wanted). */
  readonly update: (t: number) => void
  readonly done?: () => void
  readonly delay?: number
}

/** Runs timed one-off effects (dice, chip tosses, flashes). */
export class Tweens {
  private running: Array<{ tween: Tween; elapsed: number }> = []

  add(tween: Tween): void {
    this.running.push({ tween, elapsed: -(tween.delay ?? 0) })
  }

  /** Finish everything now (reduced motion, skip ahead). */
  finish(): void {
    const all = this.running
    this.running = []
    for (const r of all) {
      r.tween.update(1)
      r.tween.done?.()
    }
  }

  step(dt: number): void {
    const current = this.running
    this.running = []
    const still: typeof current = []
    for (const r of current) {
      r.elapsed += dt
      if (r.elapsed < 0) {
        still.push(r)
        continue
      }
      const t = Math.min(r.elapsed / r.tween.duration, 1)
      r.tween.update(t)
      if (t < 1) still.push(r)
      else r.tween.done?.()
    }
    // Anything a callback added this frame starts next frame.
    this.running = [...still, ...this.running]
  }

  get active(): number {
    return this.running.length
  }
}

export const easeOutCubic = (t: number): number => 1 - (1 - t) ** 3
export const easeInOutSine = (t: number): number => -(Math.cos(Math.PI * t) - 1) / 2
