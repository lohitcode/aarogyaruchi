import { useEffect, useState } from "react";

const LOCATIONS = [
  { name: "Aarogya Ruchi - Bachupally, Hyderabad", lat: 17.5358, lng: 78.3855 },
];

export default function LeafletMapClient() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="flex h-[400px] items-center justify-center bg-secondary/30">
        <p className="font-sans text-muted-foreground">Loading map...</p>
      </div>
    );
  }

  return <MapInner />;
}

function MapInner() {
  // Dynamic imports to avoid SSR issues
  const [mapComponents, setMapComponents] = useState<{
    MapContainer: typeof import("react-leaflet").MapContainer;
    TileLayer: typeof import("react-leaflet").TileLayer;
    Marker: typeof import("react-leaflet").Marker;
    Popup: typeof import("react-leaflet").Popup;
  } | null>(null);

  useEffect(() => {
    // Import leaflet CSS and components dynamically
    Promise.all([
      import("react-leaflet"),
      import("leaflet/dist/leaflet.css"),
      import("leaflet"),
    ]).then(([rl, _css, L]) => {
      // Fix default marker icons
      delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)
        ._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl:
          "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
        iconUrl:
          "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
        shadowUrl:
          "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
      });
      setMapComponents({
        MapContainer: rl.MapContainer,
        TileLayer: rl.TileLayer,
        Marker: rl.Marker,
        Popup: rl.Popup,
      });
    });
  }, []);

  if (!mapComponents) {
    return (
      <div className="flex h-[400px] items-center justify-center bg-secondary/30">
        <p className="font-sans text-muted-foreground">Loading map...</p>
      </div>
    );
  }

  const { MapContainer, TileLayer, Marker, Popup } = mapComponents;

  return (
    <MapContainer
      center={[17.5358, 78.3855]}
      zoom={14}
      style={{ height: "400px", width: "100%" }}
      scrollWheelZoom={false}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {LOCATIONS.map((loc) => (
        <Marker key={loc.name} position={[loc.lat, loc.lng]}>
          <Popup>{loc.name}</Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
