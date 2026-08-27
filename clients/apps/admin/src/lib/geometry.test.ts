import { describe, expect, it } from "vitest"

import { findConflict, intersectionArea, OVERLAP_EPS } from "./geometry"

const square = (latMin: number, latMax: number, lngMin: number, lngMax: number) =>
  [
    [latMin, lngMin],
    [latMax, lngMin],
    [latMax, lngMax],
    [latMin, lngMax],
  ] as [number, number][]

describe("intersectionArea", () => {
  it("is zero for disjoint zones", () => {
    expect(intersectionArea(square(0, 1, 0, 1), square(2, 3, 2, 3))).toBe(0)
  })

  it("is zero for a shared edge (touching is legal)", () => {
    expect(intersectionArea(square(0, 1, 0, 1), square(0, 1, 1, 2))).toBeLessThanOrEqual(
      OVERLAP_EPS,
    )
  })

  it("is zero for a corner touch", () => {
    expect(intersectionArea(square(0, 1, 0, 1), square(1, 2, 1, 2))).toBeLessThanOrEqual(
      OVERLAP_EPS,
    )
  })

  it("measures the overlapping strip", () => {
    expect(intersectionArea(square(0, 1, 0, 1.5), square(0, 1, 1, 2))).toBeCloseTo(0.5, 8)
  })

  it("returns the contained area for full containment", () => {
    expect(intersectionArea(square(0, 10, 0, 10), square(2, 4, 2, 4))).toBeCloseTo(4, 8)
  })
})

describe("findConflict", () => {
  const others = [
    { id: 1, name: "East", is_active: true, perimeters: [square(0, 1, 1, 2)] },
    { id: 2, name: "Dormant", is_active: false, perimeters: [square(0, 1, 0, 2)] },
  ]

  it("names the conflicting active locality", () => {
    expect(findConflict([square(0, 1, 0, 1.2)], others)).toBe("East")
  })

  it("ignores inactive localities even when zones overlap", () => {
    // Overlaps only Dormant's ring (lng 0-0.9 stays west of East's lng 1+).
    expect(findConflict([square(0.2, 0.8, 0.2, 0.9)], others)).toBe(null)
  })

  it("returns null for edge-adjacent zones", () => {
    expect(findConflict([square(0, 1, 0, 1)], others)).toBe(null)
  })

  it("ignores draft rings with fewer than 3 dots", () => {
    expect(findConflict([[[0.5, 1.5], [0.6, 1.6]]], others)).toBe(null)
  })
})
