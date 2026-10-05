import * as THREE from "three"
import { describe, expect, it } from "vitest"
import {
  cameraDistance,
  cardPlacement,
  CARD_W,
  chipsFor,
  DENOMINATIONS,
  labelSpot,
  seatFrame,
  TABLE_RADIUS,
  viewDirection,
  type CardSlot,
} from "../../src/scene/layout.ts"
import { dieRestQuat } from "../../src/scene/props.ts"

const slot = (over: Partial<CardSlot>): CardSlot => ({
  seat: 0,
  seats: 5,
  row: "hand",
  index: 0,
  count: 2,
  mine: true,
  faceUp: true,
  showdown: false,
  out: false,
  ...over,
})

describe("3D table layout", () => {
  it("puts you at the front and the others clockwise seen from above", () => {
    const you = seatFrame(0, 5)
    expect(you.out[0]).toBeCloseTo(0)
    expect(you.out[1]).toBeCloseTo(1)
    // Seat 1 is to your left (−x), seat 4 to your right.
    expect(seatFrame(1, 5).out[0]).toBeLessThan(0)
    expect(seatFrame(4, 5).out[0]).toBeGreaterThan(0)
  })

  it("keeps every card on the table, even with a big hand", () => {
    for (let seat = 0; seat < 5; seat++)
      for (const count of [2, 5, 9]) {
        for (let index = 0; index < count; index++) {
          const p = cardPlacement(slot({ seat, index, count, mine: seat === 0, faceUp: seat === 0 }))
          expect(Math.hypot(p.x, p.z)).toBeLessThan(TABLE_RADIUS)
        }
      }
  })

  it("never overlaps your cards while there is room", () => {
    const a = cardPlacement(slot({ index: 0, count: 3 }))
    const b = cardPlacement(slot({ index: 1, count: 3 }))
    expect(b.x - a.x).toBeGreaterThanOrEqual(CARD_W * a.scale)
  })

  it("holds your cards up face-up, and lays opponents' face-down until showdown", () => {
    const mine = cardPlacement(slot({}))
    expect(mine.pitch).toBeGreaterThan(0.5)
    expect(mine.roll).toBe(0)
    const theirs = cardPlacement(slot({ seat: 2, mine: false, faceUp: false }))
    expect(theirs.pitch).toBe(0)
    expect(theirs.roll).toBeCloseTo(Math.PI)
    const shown = cardPlacement(slot({ seat: 2, mine: false, faceUp: true, showdown: true }))
    expect(shown.roll).toBe(0)
    expect(shown.yaw).toBe(0)
  })

  it("keeps name plates on the table", () => {
    for (let seat = 0; seat < 5; seat++) expect(Math.hypot(...labelSpot(seat, 5))).toBeLessThan(TABLE_RADIUS)
  })

  it("draws chips that add up (until the cap)", () => {
    const value = (chips: ReadonlyArray<number>) => chips.reduce((sum, d) => sum + (DENOMINATIONS[d]?.value ?? 0), 0)
    expect(value(chipsFor(2_400))).toBe(2_400)
    expect(value(chipsFor(16_100))).toBe(16_100)
    expect(chipsFor(0)).toEqual([])
    expect(chipsFor(10_000_000).length).toBeLessThanOrEqual(40)
  })

  it("pulls the camera back and looks down more steeply on a tall phone", () => {
    expect(cameraDistance(390 / 700, 40)).toBeGreaterThan(cameraDistance(16 / 9, 40))
    expect(viewDirection(0.5)[1]).toBeGreaterThan(viewDirection(1.8)[1])
  })

  it("lands each die value face up", () => {
    // Box faces +x, −x, +y, −y, +z, −z carry 1, 6, 2, 5, 3, 4.
    const normals: Record<number, THREE.Vector3> = {
      1: new THREE.Vector3(1, 0, 0),
      6: new THREE.Vector3(-1, 0, 0),
      2: new THREE.Vector3(0, 1, 0),
      5: new THREE.Vector3(0, -1, 0),
      3: new THREE.Vector3(0, 0, 1),
      4: new THREE.Vector3(0, 0, -1),
    }
    for (let v = 1; v <= 6; v++) {
      const up = normals[v]!.clone().applyQuaternion(dieRestQuat(v, 1.3))
      expect(up.y).toBeCloseTo(1)
    }
  })
})
