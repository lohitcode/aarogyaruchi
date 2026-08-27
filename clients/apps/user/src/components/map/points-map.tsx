import { useEffect, useState } from "react"

/**
 * Generic Leaflet + OSM map with labelled markers. Client-only: components
 * load dynamically so SSR never touches window/leaflet.
 */

export type MapPoint = {
  id: string
  lat: number
  lng: number
  label: string
  kind?: "customer" | "partner"
}

type PointsMapProps = {
  points: MapPoint[]
  center?: [number, number]
  zoom?: number
  height?: number
}

type Loaded = {
  MapContainer: typeof import("react-leaflet").MapContainer
  TileLayer: typeof import("react-leaflet").TileLayer
  Marker: typeof import("react-leaflet").Marker
  Popup: typeof import("react-leaflet").Popup
  divIcon: typeof import("leaflet").divIcon
}

export default function PointsMap({
  points,
  center,
  zoom = 14,
  height = 320,
}: PointsMapProps) {
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    Promise.all([
      import("react-leaflet"),
      import("leaflet"),
      import("leaflet/dist/leaflet.css"),
    ]).then(([rl, L, _css]) => {
      setLoaded({
        MapContainer: rl.MapContainer,
        TileLayer: rl.TileLayer,
        Marker: rl.Marker,
        Popup: rl.Popup,
        divIcon: L.divIcon,
      })
    })
  }, [])

  if (!mounted || !loaded) {
    return (
      <div
        className="flex items-center justify-center bg-secondary/30"
        style={{ height }}
        aria-label="Loading map"
      />
    )
  }

  const { MapContainer, TileLayer, Marker, Popup, divIcon } = loaded
  const fallback: [number, number] =
    center ??
    (points[0] ? [points[0].lat, points[0].lng] : [17.5358, 78.3855])

  return (
    <MapContainer
      center={fallback}
      zoom={zoom}
      style={{ height, width: "100%" }}
      scrollWheelZoom={false}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {points
        .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng))
        .map((p) => (
          <Marker
            key={p.id}
            position={[p.lat, p.lng]}
            icon={divIcon({
              className: "",
              html:
                p.kind === "partner"
                  ? '<div style="width:14px;height:14px;border-radius:50%;background:#1d4ed8;border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,.5)"></div>'
                  : '<div style="width:14px;height:14px;border-radius:50%;background:#15803D;border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,.5)"></div>',
              iconSize: [18, 18],
              iconAnchor: [9, 9],
            })}
          >
            <Popup>{p.label}</Popup>
          </Marker>
        ))}
    </MapContainer>
  )
}
