// One-off effects played for a beat: the dice roll, chips tossed between seats and
// pots, a burst of sparks for a winner. They decorate a beat; the snapshot itself is
// already drawn, so skipping an effect never leaves the table wrong.
import * as THREE from "three"
import { SPOTS } from "./layout.ts"
import { easeOutCubic, type Tweens } from "./motion.ts"
import { chipMesh, dieRestQuat, makeDie } from "./props.ts"

const DICE_REST = [
  new THREE.Vector3(SPOTS.dice[0] - 0.28, 0.17, SPOTS.dice[1]),
  new THREE.Vector3(SPOTS.dice[0] + 0.28, 0.17, SPOTS.dice[1] + 0.08),
] as const

export const rollDice = {
  make(group: THREE.Group): ReadonlyArray<THREE.Mesh> {
    return DICE_REST.map((rest, i) => {
      const die = makeDie()
      die.position.copy(rest)
      die.quaternion.copy(dieRestQuat(i + 1, i * 0.6))
      group.add(die)
      return die
    })
  },

  /** Throw both dice from your side; they tumble, bounce and land on `values`. */
  throw(tweens: Tweens, dice: ReadonlyArray<THREE.Mesh>, values: readonly [number, number], doubles: boolean): void {
    dice.forEach((die, i) => {
      const rest = DICE_REST[i] ?? DICE_REST[0]
      const from = new THREE.Vector3(rest.x + (i === 0 ? -0.9 : 0.9), 1.6, rest.z + 2.1)
      const end = dieRestQuat(values[i] ?? 1, Math.random() * Math.PI * 2)
      const axis = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize()
      const turns = 3 + Math.random() * 2
      const spin = new THREE.Quaternion()
      const mats = Array.isArray(die.material) ? die.material : [die.material]
      tweens.add({
        duration: 0.85,
        delay: i * 0.05,
        update: (t) => {
          const e = easeOutCubic(t)
          die.position.lerpVectors(from, rest, e)
          // Two bounces on the way down.
          die.position.y = rest.y + Math.abs(Math.cos(t * Math.PI * 2.5)) * (1 - t) * 1.2
          spin.setFromAxisAngle(axis, (1 - e) * turns * Math.PI * 2)
          die.quaternion.copy(end).premultiply(spin)
        },
        done: () => {
          die.position.copy(rest)
          die.quaternion.copy(end)
        },
      })
      // Doubles glow red for a moment: the shift is coming.
      if (doubles)
        tweens.add({
          duration: 1.4,
          delay: 0.85,
          update: (t) => {
            for (const m of mats) if (m instanceof THREE.MeshStandardMaterial) m.emissive.setRGB(0.9 * Math.sin(Math.PI * t), 0.05, 0.1)
          },
        })
    })
  },
}

/** Toss `n` chips from one point to another in a little arc, then drop them. */
export const tossChips = (tweens: Tweens, group: THREE.Group, from: THREE.Vector3, to: THREE.Vector3, n: number): void => {
  for (let i = 0; i < n; i++) {
    const chip = chipMesh(Math.floor(Math.random() * 4))
    const jitter = new THREE.Vector3((Math.random() - 0.5) * 0.3, 0, (Math.random() - 0.5) * 0.3)
    const a = from.clone().add(jitter)
    const b = to.clone().add(jitter)
    chip.position.copy(a)
    chip.visible = false
    group.add(chip)
    tweens.add({
      duration: 0.55,
      delay: i * 0.05,
      update: (t) => {
        chip.visible = true
        chip.position.lerpVectors(a, b, easeOutCubic(t))
        chip.position.y += Math.sin(Math.PI * t) * 0.8
        chip.rotation.x = t * Math.PI * 2
      },
      done: () => group.remove(chip),
    })
  }
}

let spark: THREE.Texture | undefined
const sparkTexture = (): THREE.Texture => {
  if (spark !== undefined) return spark
  const c = document.createElement("canvas")
  c.width = c.height = 64
  const ctx = c.getContext("2d")
  if (ctx !== null) {
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32)
    g.addColorStop(0, "rgba(255,255,255,1)")
    g.addColorStop(0.3, "rgba(255,214,120,0.9)")
    g.addColorStop(1, "rgba(255,180,60,0)")
    ctx.fillStyle = g
    ctx.fillRect(0, 0, 64, 64)
  }
  spark = new THREE.CanvasTexture(c)
  return spark
}

/** A shower of gold sparks for a winner. */
export const burst = (tweens: Tweens, group: THREE.Group, at: THREE.Vector3): void => {
  const n = 90
  const pos = new Float32Array(n * 3)
  const vel = Array.from({ length: n }, () =>
    new THREE.Vector3(Math.random() - 0.5, Math.random() * 1.2 + 0.6, Math.random() - 0.5).multiplyScalar(2.6),
  )
  const geo = new THREE.BufferGeometry()
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3))
  const mat = new THREE.PointsMaterial({ map: sparkTexture(), size: 0.22, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xffd27a })
  const points = new THREE.Points(geo, mat)
  group.add(points)
  tweens.add({
    duration: 1.8,
    delay: 0.4,
    update: (t) => {
      const time = t * 1.8
      vel.forEach((v, i) => {
        pos[i * 3] = at.x + v.x * time
        pos[i * 3 + 1] = at.y + v.y * time - 2.4 * time * time
        pos[i * 3 + 2] = at.z + v.z * time
      })
      geo.attributes["position"]!.needsUpdate = true
      mat.opacity = 1 - t
    },
    done: () => {
      group.remove(points)
      geo.dispose()
      mat.dispose()
    },
  })
}
