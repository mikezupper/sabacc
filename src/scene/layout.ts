// Where everything sits on the 3D table. Pure numbers (no Three.js objects) so the
// layout is unit-testable. Units are roughly decimetres; the felt is at y = 0, the
// table centre is the origin, +z points at the camera (your seat), +x to your right.

export const TABLE_RADIUS = 5.2
export const CARD_W = 0.64
export const CARD_H = 0.96
/** Lift over the felt so cards never z-fight it. */
export const CARD_Y = 0.02

export interface Placement {
  readonly x: number
  readonly y: number
  readonly z: number
  /** Turn about the vertical axis; 0 = card bottom towards +z. */
  readonly yaw: number
  /** Tilt up towards the viewer (radians). */
  readonly pitch: number
  /** 0 face up, π face down. */
  readonly roll: number
  readonly scale: number
}

export interface SeatFrame {
  /** Angle round the table; 0 is your seat, increasing clockwise seen from above. */
  readonly angle: number
  /** Unit vector from the centre to the seat (x, z). */
  readonly out: readonly [number, number]
  /** Unit vector along the seat's edge, to its right hand as it faces the centre. */
  readonly along: readonly [number, number]
}

/** Seat 0 at the front; the others clockwise (seen from above), evenly spaced. */
export const seatFrame = (index: number, count: number): SeatFrame => {
  const angle = (index * 2 * Math.PI) / Math.max(count, 1)
  const out = [-Math.sin(angle), Math.cos(angle)] as const
  // Facing the centre (direction -out), the seat's right hand is out rotated by +90°.
  const along = [out[1], -out[0]] as const
  return { angle, out, along }
}

/** A point `radius` from the centre towards the seat, shifted `side` along its edge. */
export const seatPoint = (frame: SeatFrame, radius: number, side = 0): readonly [number, number] => [
  frame.out[0] * radius + frame.along[0] * side,
  frame.out[1] * radius + frame.along[1] * side,
]

/** Centre-to-centre gap for `n` cards in a row no wider than `maxWidth`. */
export const cardGap = (n: number, maxWidth: number, preferred: number): number =>
  n <= 1 ? 0 : Math.min(preferred, (maxWidth - CARD_W) / (n - 1))

/** Offset of slot `i` of `n` from the row's centre. */
const rowOffset = (i: number, n: number, gap: number): number => (i - (n - 1) / 2) * gap

export type CardRow = "hand" | "field"

export interface CardSlot {
  readonly seat: number
  readonly seats: number
  readonly row: CardRow
  readonly index: number
  readonly count: number
  /** Your own hand: held up towards the camera, bigger. */
  readonly mine: boolean
  readonly faceUp: boolean
  /** Showdown: turn the card to face the camera so it can be read. */
  readonly showdown: boolean
  /** Folded or sitting out: pushed in towards the pot. */
  readonly out: boolean
}

const YOUR_HAND_RADIUS = 3.8
const YOUR_FIELD_RADIUS = 2.35
const HAND_RADIUS = 3.1
const FIELD_RADIUS = 2.25

/** Where a card goes, given its seat and position in its row. */
export const cardPlacement = (s: CardSlot): Placement => {
  const frame = seatFrame(s.seat, s.seats)
  const roll = s.faceUp ? 0 : Math.PI
  if (s.mine && s.row === "hand" && !s.out) {
    const scale = 1.6
    const gap = cardGap(s.count, 5.6, CARD_W * scale * 1.06)
    const off = rowOffset(s.index, s.count, gap)
    const [x, z] = seatPoint(frame, YOUR_HAND_RADIUS, off)
    // A gentle fan: outer cards sit a little lower and further back.
    const curve = (off / 2.6) ** 2 * 0.25
    return { x, y: 0.85 - curve, z: z - curve, yaw: 0, pitch: 1.0, roll, scale }
  }
  const radius = s.row === "field" ? (s.mine ? YOUR_FIELD_RADIUS : FIELD_RADIUS) : s.out ? HAND_RADIUS - 0.5 : HAND_RADIUS
  const scale = s.mine ? 1.1 : 0.9
  const gap = cardGap(s.count, s.row === "field" ? 1.8 : 2.4, CARD_W * scale * 1.12)
  const [x, z] = seatPoint(frame, radius, rowOffset(s.index, s.count, gap))
  if (s.showdown) return { x, y: CARD_Y + 0.42, z, yaw: 0, pitch: 0.9, roll: 0, scale: scale * 1.1 }
  // Cards lie flat with their bottom edge towards their owner.
  return { x, y: CARD_Y + s.index * 0.002, z, yaw: -frame.angle, pitch: 0, roll, scale }
}

/** Fixed spots in the middle of the table. */
export const SPOTS = {
  deck: [0.0, -1.15] as const,
  discard: [1.25, -1.05] as const,
  handPot: [-1.05, 0.15] as const,
  sabaccPot: [1.05, 0.15] as const,
  dice: [0.0, 1.05] as const,
}

/** Where a seat's bet chips sit, between its cards and the pot. */
export const betSpot = (seat: number, seats: number): readonly [number, number] =>
  seatPoint(seatFrame(seat, seats), seat === 0 ? 2.7 : 1.75, seat === 0 ? -1.6 : 0.95)

/** The dealer button, beside the seat's cards. */
export const dealerSpot = (seat: number, seats: number): readonly [number, number] =>
  seatPoint(seatFrame(seat, seats), seat === 0 ? 2.7 : 2.6, seat === 0 ? 1.6 : -1.45)

/** The seat's name plate: inside the rim behind the cards; yours beside your hand. */
export const labelSpot = (seat: number, seats: number): readonly [number, number] =>
  seat === 0 ? seatPoint(seatFrame(0, seats), 3.7, -3.4) : seatPoint(seatFrame(seat, seats), 4.55)

/** Centre of a seat's cards, where the turn ring glows. */
export const handSpot = (seat: number, seats: number): readonly [number, number] =>
  seatPoint(seatFrame(seat, seats), seat === 0 ? 3.3 : 2.75)

/** Chip denominations, largest first, with their colours. */
export const DENOMINATIONS = [
  { value: 5000, color: 0x7b3fe4 },
  { value: 1000, color: 0xe0b23a },
  { value: 100, color: 0x2e8fd6 },
] as const

const MAX_CHIPS = 40

/** Chips (by denomination index) making up `amount`, largest first, capped for drawing. */
export const chipsFor = (amount: number): ReadonlyArray<number> => {
  const out: Array<number> = []
  let rest = Math.max(0, Math.round(amount))
  DENOMINATIONS.forEach((d, i) => {
    const n = Math.floor(rest / d.value)
    rest -= n * d.value
    for (let k = 0; k < n && out.length < MAX_CHIPS; k++) out.push(i)
  })
  if (rest > 0 && out.length < MAX_CHIPS) out.push(DENOMINATIONS.length - 1)
  return out
}

/**
 * Camera distance so a table of `radius` fits the view: wide screens are limited by
 * height, tall phones by width.
 */
export const cameraDistance = (aspect: number, fovDeg: number, radius = TABLE_RADIUS + 0.4): number => {
  const v = (fovDeg * Math.PI) / 180
  const h = 2 * Math.atan(Math.tan(v / 2) * aspect)
  const byWidth = radius / Math.tan(h / 2)
  const byHeight = (radius * 0.82) / Math.tan(v / 2)
  return Math.max(byWidth, byHeight)
}

/**
 * Direction from the table to the camera: behind your seat at ~55° on wide screens,
 * steeper on tall phones so the round table fills the height.
 */
export const viewDirection = (aspect: number): readonly [number, number, number] => {
  const t = Math.min(Math.max((1.2 - aspect) / 0.7, 0), 1)
  const elevation = 0.98 + t * 0.4
  return [0, Math.sin(elevation), Math.cos(elevation)]
}
