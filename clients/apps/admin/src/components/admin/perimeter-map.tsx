import { createContext, useContext, useEffect, useRef, useState } from "react"

import type { LocalityZones, Ring } from "../../lib/geometry"

/**
 * Leaflet drawing surface for locality perimeters. Click the map to drop
 * dots; click the highlighted first dot (or the Finish zone button next to
 * the map) to close a ring. Client-only: react-leaflet loads dynamically so
 * SSR never touches window.
 */

type Loaded = {
  MapContainer: typeof import("react-leaflet").MapContainer
  TileLayer: typeof import("react-leaflet").TileLayer
  Polygon: typeof import("react-leaflet").Polygon
  Polyline: typeof import("react-leaflet").Polyline
  CircleMarker: typeof import("react-leaflet").CircleMarker
  Tooltip: typeof import("react-leaflet").Tooltip
  useMap: typeof import("react-leaflet").useMap
  useMapEvents: typeof import("react-leaflet").useMapEvents
}

type PerimeterMapProps = {
  /** Every other locality, for context + the no-overlap rule. */
  others: LocalityZones[]
  /** Saved zones of the locality being edited. */
  rings: Ring[]
  /** Dots of the zone currently being drawn. */
  draft: Ring
  hasConflict: boolean
  onAddDot: (lat: number, lng: number) => void
  onFinish: () => void
  height?: number
}

const DEFAULT_CENTER: [number, number] = [17.5358, 78.3855]

type Pt = [number, number]

function centroid(points: Pt[]): Pt | null {
  if (points.length === 0) return null
  let lat = 0
  let lng = 0
  for (const p of points) {
    lat += p[0]
    lng += p[1]
  }
  return [lat / points.length, lng / points.length]
}

const allPoints = (rings: Ring[]): Pt[] => rings.flat()

// Owns the hover position so mousemove only re-renders the preview, not the
// whole map.
function DrawLayer({
  draft,
  zoneColor,
  onAddDot,
  onFinish,
}: {
  draft: Ring
  zoneColor: string
  onAddDot: (lat: number, lng: number) => void
  onFinish: () => void
}) {
  const { Polyline, CircleMarker, Tooltip, useMapEvents } = useLoaded()
  const [hover, setHover] = useState<Pt | null>(null)
  useMapEvents({
    click(e) {
      onAddDot(e.latlng.lat, e.latlng.lng)
    },
    mousemove(e) {
      setHover([e.latlng.lat, e.latlng.lng])
    },
  })
  if (draft.length === 0) return null
  const firstDot = draft.length >= 3 ? draft[0] : null
  return (
    <>
      <Polyline
        positions={draft}
        pathOptions={{ color: zoneColor, weight: 2, dashArray: "6 6" }}
      />
      {hover && (
        <Polyline
          positions={[draft[draft.length - 1], hover, draft[0]]}
          pathOptions={{ color: zoneColor, weight: 1, opacity: 0.5, dashArray: "3 5" }}
        />
      )}
      {draft.map((p, i) => (
        <CircleMarker
          key={`dot-${i}`}
          center={p}
          radius={5}
          pathOptions={{ color: "#ffffff", weight: 2, fillColor: zoneColor, fillOpacity: 1 }}
          interactive={false}
        />
      ))}
      {firstDot && (
        <CircleMarker
          center={firstDot}
          radius={9}
          pathOptions={{ color: "#ffffff", weight: 2, fillColor: "#16a34a", fillOpacity: 1 }}
          eventHandlers={{ click: onFinish }}
        >
          <Tooltip>Close the zone here</Tooltip>
        </CircleMarker>
      )}
    </>
  )
}

function FitAll({ points }: { points: Pt[] }) {
  const { useMap } = useLoaded()
  const map = useMap()
  const didFit = useRef(false)
  useEffect(() => {
    if (didFit.current || points.length === 0) return
    didFit.current = true
    map.fitBounds(points, { padding: [24, 24] })
  }, [points, map])
  return null
}

// Loaded-module context: the children above need the dynamically imported
// react-leaflet members but must be defined at module level.
const LoadedContext = createContext<Loaded | null>(null)
function useLoaded(): Loaded {
  const loaded = useContext(LoadedContext)
  if (!loaded) throw new Error("PerimeterMap children used outside PerimeterMap")
  return loaded
}

export default function PerimeterMap({
  others,
  rings,
  draft,
  hasConflict,
  onAddDot,
  onFinish,
  height = 440,
}: PerimeterMapProps) {
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [mounted, setMounted] = useState(false)
  const initialCenter = useRef<Pt | null>(null)

  useEffect(() => {
    setMounted(true)
    Promise.all([import("react-leaflet"), import("leaflet"), import("leaflet/dist/leaflet.css")]).then(
      ([rl, _L, _css]) => {
        setLoaded({
          MapContainer: rl.MapContainer,
          TileLayer: rl.TileLayer,
          Polygon: rl.Polygon,
          Polyline: rl.Polyline,
          CircleMarker: rl.CircleMarker,
          Tooltip: rl.Tooltip,
          useMap: rl.useMap,
          useMapEvents: rl.useMapEvents,
        })
      },
    )
  }, [])

  if (initialCenter.current === null) {
    initialCenter.current =
      centroid(allPoints(rings)) ??
      centroid(draft) ??
      centroid(others.flatMap((o) => allPoints(o.perimeters))) ??
      DEFAULT_CENTER
  }

  if (!mounted || !loaded) {
    return (
      <div
        className="flex items-center justify-center bg-neutral-100 text-sm text-neutral-400"
        style={{ height }}
        aria-label="Loading map"
      >
        Loading map…
      </div>
    )
  }

  const { MapContainer, TileLayer, Polygon, Tooltip } = loaded
  const zoneColor = hasConflict ? "#dc2626" : "#2563eb"
  const fitPoints: Pt[] = [
    ...allPoints(rings),
    ...allPoints(others.flatMap((o) => o.perimeters)),
  ]

  return (
    <LoadedContext.Provider value={loaded}>
      <MapContainer
        center={initialCenter.current}
        zoom={13}
        style={{ height, width: "100%", cursor: "crosshair" }}
        scrollWheelZoom
        doubleClickZoom={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitAll points={fitPoints} />

        {others.map((other) =>
          other.perimeters.map((ring, i) => (
            <Polygon
              key={`other-${other.id}-${i}`}
              positions={ring}
              pathOptions={{
                color: "#64748b",
                weight: 1.5,
                fillOpacity: other.is_active ? 0.1 : 0,
                dashArray: other.is_active ? undefined : "5 5",
              }}
            >
              <Tooltip sticky>
                {other.name}
                {other.is_active ? "" : " (inactive)"}
              </Tooltip>
            </Polygon>
          )),
        )}

        {rings.map((ring, i) => (
          <Polygon
            key={`ring-${i}`}
            positions={ring}
            pathOptions={{ color: zoneColor, weight: 2, fillOpacity: 0.18 }}
          />
        ))}

        <DrawLayer draft={draft} zoneColor={zoneColor} onAddDot={onAddDot} onFinish={onFinish} />
      </MapContainer>
    </LoadedContext.Provider>
  )
}
