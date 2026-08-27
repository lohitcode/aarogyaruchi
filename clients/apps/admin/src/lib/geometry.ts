// The package ships a default export at runtime but types its members as
// named exports — the synthetic default carries the same type either way.
import polygonClipping from "polygon-clipping"
import type { Polygon as ClipPolygon } from "polygon-clipping"

/**
 * Locality perimeter math shared by the admin drawing UI and checkout
 * auto-assign. Rings are [lat, lng] pairs, unclosed (first point not
 * repeated) — the same shape stored in the DB and sent over the API.
 */

export type Ring = [number, number][]

// Square degrees of intersection below which two perimeters count as merely
// touching (shared edges are legal between adjacent zones). Mirrors
// OverlapEPS on the Go side.
export const OVERLAP_EPS = 1e-11

export type LocalityZones = {
  id: number
  name: string
  is_active: boolean
  perimeters: Ring[]
}

// polygon-clipping speaks closed [x, y] rings; we store unclosed [lat, lng].
const toGeom = (ring: Ring): ClipPolygon => {
  const closed: [number, number][] = ring.map(([lat, lng]) => [lng, lat])
  const [firstLat, firstLng] = ring[0]
  closed.push([firstLng, firstLat])
  return [closed]
}

const shoelace = (ring: number[][]): number => {
  let sum = 0
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    sum += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1]
  }
  return Math.abs(sum) / 2
}

export function intersectionArea(a: Ring, b: Ring): number {
  if (a.length < 3 || b.length < 3) return 0
  let area = 0
  try {
    const result = polygonClipping.intersection(toGeom(a), toGeom(b))
    for (const polygon of result) {
      for (let i = 0; i < polygon.length; i++) {
        // First ring is the exterior, the rest are holes.
        area += (i === 0 ? 1 : -1) * shoelace(polygon[i])
      }
    }
  } catch {
    // Degenerate input during drawing — the server re-validates on save.
    return 0
  }
  return area
}

/**
 * Returns the name of the first OTHER active locality whose perimeter
 * overlaps any of the given rings with area > OVERLAP_EPS, or null.
 */
export function findConflict(rings: Ring[], others: LocalityZones[]): string | null {
  for (const other of others) {
    if (!other.is_active) continue
    for (const theirRing of other.perimeters) {
      for (const myRing of rings) {
        if (intersectionArea(myRing, theirRing) > OVERLAP_EPS) {
          return other.name
        }
      }
    }
  }
  return null
}
