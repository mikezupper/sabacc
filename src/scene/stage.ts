// The Three.js stage: renderer, camera, lights, orbit controls, picking and the frame
// loop. It draws whatever `Board.show` was last given and reports card clicks.
import * as THREE from "three"
import { OrbitControls } from "three/addons/controls/OrbitControls.js"
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js"
import { CSS2DRenderer } from "three/addons/renderers/CSS2DRenderer.js"
import { Board, type BoardView } from "./board.ts"
import { cameraDistance, viewDirection } from "./layout.ts"
import { approach } from "./motion.ts"
import { buildTable } from "./props.ts"

const FOV = 40
const TARGET = new THREE.Vector3(0, 0, 0.4)

export interface StageOptions {
  readonly seats: number
  /** A card was clicked or tapped (its id). */
  readonly onPick: (cardId: number) => void
  /** The pointer moved onto or off a pickable card. */
  readonly onHover: (cardId: number | undefined) => void
}

/** True when this browser can draw WebGL. */
export const webglAvailable = (): boolean => {
  const c = document.createElement("canvas")
  return c.getContext("webgl2") !== null || c.getContext("webgl") !== null
}

export class Stage {
  readonly renderer: THREE.WebGLRenderer
  private readonly labels = new CSS2DRenderer()
  private readonly scene = new THREE.Scene()
  private readonly camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 100)
  private readonly controls: OrbitControls
  private readonly board: Board
  private readonly flash = new THREE.PointLight(0x6fe8ff, 0, 0, 2)
  private readonly glowRing: THREE.Object3D | undefined
  private readonly resize: ResizeObserver
  private readonly raycaster = new THREE.Raycaster()
  private readonly pointer = new THREE.Vector2()
  private readonly timer = new THREE.Timer()
  private pickable: ReadonlySet<number> = new Set()
  private hovered: number | undefined
  private down: { x: number; y: number } | undefined
  private shake = 0
  private flashLevel = 0
  private home = new THREE.Vector3()
  private resetting = false
  private fittedWidth = 0
  private fittedHeight = 0
  /** The player has turned or zoomed the camera: resizes keep their view. */
  private userMoved = false
  /** Frames drawn (tests and the drive script wait on this). */
  frames = 0

  constructor(
    private readonly host: HTMLElement,
    private readonly options: StageOptions,
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" })
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFShadowMap
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.05
    this.renderer.domElement.classList.add("gl")
    this.labels.domElement.classList.add("labels")
    host.append(this.renderer.domElement, this.labels.domElement)

    const pmrem = new THREE.PMREMGenerator(this.renderer)
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    this.scene.environmentIntensity = 0.3
    pmrem.dispose()

    this.scene.add(new THREE.HemisphereLight(0x8fa8ff, 0x1a1226, 0.55))
    const key = new THREE.SpotLight(0xffe2b8, 420, 0, 0.62, 0.55, 2)
    key.position.set(0, 11, 2.5)
    key.target.position.set(0, 0, 0.3)
    key.castShadow = true
    key.shadow.mapSize.set(2048, 2048)
    key.shadow.bias = -0.0003
    key.shadow.normalBias = 0.02
    const teal = new THREE.PointLight(0x3fd0e0, 45, 0, 2)
    teal.position.set(-7, 3.5, -4)
    const amber = new THREE.PointLight(0xff9a4a, 40, 0, 2)
    amber.position.set(7, 3, -3)
    this.flash.position.set(0, 3, 0.5)
    this.scene.add(key, key.target, teal, amber, this.flash)

    const table = buildTable(options.seats)
    this.glowRing = table.getObjectByName("glow-ring")
    this.board = new Board(options.seats, { onShift: () => this.onShift() })
    this.scene.add(table, this.board.group)

    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.target.copy(TARGET)
    this.controls.enableDamping = true
    this.controls.enablePan = false
    this.controls.minPolarAngle = 0.2
    this.controls.maxPolarAngle = 1.22
    this.controls.minDistance = 6
    this.controls.maxDistance = 26
    this.controls.rotateSpeed = 0.6
    this.controls.addEventListener("start", () => {
      this.resetting = false
      this.userMoved = true
    })

    const el = this.renderer.domElement
    el.addEventListener("pointermove", this.onPointerMove)
    el.addEventListener("pointerdown", this.onPointerDown)
    el.addEventListener("pointerup", this.onPointerUp)
    el.addEventListener("pointerleave", () => this.setHover(undefined))

    this.resize = new ResizeObserver(() => {
      if (this.disposed || !this.fit()) return
      // setSize clears the canvas; paint before the browser presents this resize.
      this.frame(performance.now())
    })
    this.resize.observe(host)
    this.fit()
    this.camera.position.copy(this.home)
    this.renderer.setAnimationLoop((t) => this.frame(t))
  }

  show(view: BoardView): void {
    this.pickable = view.pickable
    this.board.show(view)
  }

  /** Swing the camera back to the default view. */
  resetView(): void {
    this.userMoved = false
    this.resetting = true
  }

  get cardCount(): number {
    return this.board.cardCount
  }

  /** True once the stage has shut down (<sabacc-stage> left the page). */
  disposed = false

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.renderer.setAnimationLoop(null)
    this.resize.disconnect()
    this.controls.dispose()
    this.renderer.dispose()
    this.renderer.domElement.remove()
    this.labels.domElement.remove()
  }

  private fit(): boolean {
    const w = Math.max(this.host.clientWidth, 1)
    const h = Math.max(this.host.clientHeight, 1)
    if (w === this.fittedWidth && h === this.fittedHeight) return false
    this.fittedWidth = w
    this.fittedHeight = h
    this.renderer.setSize(w, h, false)
    this.labels.setSize(w, h)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    // CSS2D names extend beyond their world points. Reserve horizontal room for
    // that text, especially when a short phone's stage is limited by its width.
    const d = cameraDistance(Math.max(w - 48, 1) / h, FOV)
    this.home.set(...viewDirection(w / h)).multiplyScalar(d).add(TARGET)
    this.controls.maxDistance = Math.max(26, d * 1.3)
    if (!this.userMoved) this.resetting = true
    return true
  }

  private onShift(): void {
    this.shake = 0.6
    this.flashLevel = 1
  }

  private frame(now: number): void {
    this.timer.update(now)
    const dt = Math.min(this.timer.getDelta(), 0.05)
    this.board.step(dt)
    if (this.resetting) {
      this.camera.position.lerp(this.home, approach(4, dt))
      if (this.camera.position.distanceTo(this.home) < 0.01) this.resetting = false
    }
    this.controls.update()
    // Shift: lights flare cyan, the rim glows magenta, the camera shudders.
    this.flashLevel = Math.max(0, this.flashLevel - dt * 0.9)
    this.flash.intensity = this.flashLevel * 160
    if (this.glowRing instanceof THREE.Mesh && this.glowRing.material instanceof THREE.MeshBasicMaterial)
      this.glowRing.material.color.setRGB(0.31 + this.flashLevel * 0.7, 0.85 - this.flashLevel * 0.6, 0.94)
    const shake = new THREE.Vector3()
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt)
      const s = this.shake * 0.12
      shake.set((Math.random() - 0.5) * s, (Math.random() - 0.5) * s, (Math.random() - 0.5) * s)
      this.camera.position.add(shake)
    }
    this.renderer.render(this.scene, this.camera)
    this.labels.render(this.scene, this.camera)
    this.camera.position.sub(shake)
    this.frames++
  }

  private pick(e: PointerEvent): number | undefined {
    const rect = this.renderer.domElement.getBoundingClientRect()
    this.pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1)
    this.raycaster.setFromCamera(this.pointer, this.camera)
    const hit = this.raycaster.intersectObjects([...this.board.pickTargets(this.pickable)], true)[0]
    const id = hit?.object.userData["cardId"]
    return typeof id === "number" && this.pickable.has(id) ? id : undefined
  }

  private setHover(id: number | undefined): void {
    if (id === this.hovered) return
    this.hovered = id
    this.renderer.domElement.style.cursor = id === undefined ? "" : "pointer"
    this.options.onHover(id)
  }

  private readonly onPointerMove = (e: PointerEvent): void => {
    if (e.pointerType === "mouse") this.setHover(this.pick(e))
  }

  private readonly onPointerDown = (e: PointerEvent): void => {
    this.down = { x: e.clientX, y: e.clientY }
  }

  /** A click is a press and release without dragging the camera. */
  private readonly onPointerUp = (e: PointerEvent): void => {
    const d = this.down
    this.down = undefined
    if (d === undefined || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6) return
    const id = this.pick(e)
    if (id !== undefined) this.options.onPick(id)
  }
}
