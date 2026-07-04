/**
 * Light TMS - Lat/long picker on a Leaflet map.
 *
 * Ports initMapa() from public/assets/js/app.js: OpenStreetMap tiles, draggable
 * marker, click-to-set, Nominatim address search, and a "paste a Google Maps
 * link (or lat,lng)" parser. Coordinates are emitted with 8 decimals.
 */

import { useMemo, useState } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
import { MapPin, Search, Clipboard } from 'lucide-react';

// Fix Leaflet's default icon paths when bundled by Vite.
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

const BOGOTA: [number, number] = [4.6097, -74.0817];

interface MapPickerProps {
  lat: string | null;
  lng: string | null;
  onChange: (lat: string, lng: string) => void;
}

/** Parses coordinates from a Google Maps URL or a "lat,lng" string. */
export function extraerCoords(s: string): [number, number] | null {
  if (!s) return null;
  s = s.trim();
  const patterns = [
    /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/,
    /@(-?\d+\.\d+),(-?\d+\.\d+)/,
    /[?&](?:q|query|ll|center)=(-?\d+\.\d+),(-?\d+\.\d+)/,
    /^(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)$/,
  ];
  for (const re of patterns) {
    const m = s.match(re);
    if (m && m[1] && m[2]) return [parseFloat(m[1]), parseFloat(m[2])];
  }
  return null;
}

function ClickHandler({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onPick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

/** Recenters the map imperatively when coords change from the search/paste tools. */
function Recenter({ pos }: { pos: [number, number] | null }) {
  const map = useMap();
  if (pos) map.setView(pos, 16);
  return null;
}

export function MapPicker({ lat, lng, onChange }: MapPickerProps) {
  const initial = useMemo<[number, number] | null>(() => {
    const la = lat ? parseFloat(lat) : NaN;
    const lo = lng ? parseFloat(lng) : NaN;
    return Number.isFinite(la) && Number.isFinite(lo) ? [la, lo] : null;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [pos, setPos] = useState<[number, number] | null>(initial);
  const [search, setSearch] = useState('');
  const [paste, setPaste] = useState('');
  const [error, setError] = useState<string | null>(null);

  function set(la: number, lo: number) {
    const p: [number, number] = [la, lo];
    setPos(p);
    onChange(la.toFixed(8), lo.toFixed(8));
  }

  async function geocode() {
    setError(null);
    const q = search.trim();
    if (!q) return;
    try {
      const res = await fetch(
        'https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=co&q=' +
          encodeURIComponent(q),
      );
      const data = (await res.json()) as Array<{ lat: string; lon: string }>;
      if (data.length && data[0]) set(parseFloat(data[0].lat), parseFloat(data[0].lon));
      else setError('No se encontró la dirección.');
    } catch {
      setError('No se pudo buscar la dirección.');
    }
  }

  function usePaste() {
    const c = extraerCoords(paste);
    if (c) {
      set(c[0], c[1]);
      setPaste('');
      setError(null);
    } else {
      setError('Pega un enlace de Google Maps con coordenadas o escribe "lat,lng".');
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            className="field-input pl-9"
            placeholder="Buscar dirección…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), geocode())}
          />
        </div>
        <button type="button" className="btn-ghost" onClick={geocode}>
          <Search size={16} /> Buscar
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Clipboard size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            className="field-input pl-9"
            placeholder="Pegar enlace de Google Maps o lat,lng"
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), usePaste())}
          />
        </div>
        <button type="button" className="btn-ghost" onClick={usePaste}>
          <MapPin size={16} /> Usar
        </button>
      </div>
      {error && <p className="text-sm text-amber-600">{error}</p>}

      <div className="h-72 overflow-hidden rounded-lg ring-1 ring-slate-200">
        <MapContainer center={pos ?? BOGOTA} zoom={pos ? 15 : 6} className="h-full w-full">
          <TileLayer
            attribution="© OpenStreetMap"
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            maxZoom={19}
          />
          <ClickHandler onPick={set} />
          <Recenter pos={pos} />
          {pos && (
            <Marker
              position={pos}
              draggable
              eventHandlers={{
                dragend: (e: L.LeafletEvent) => {
                  const ll = (e.target as L.Marker).getLatLng();
                  set(ll.lat, ll.lng);
                },
              }}
            />
          )}
        </MapContainer>
      </div>
      {pos && (
        <p className="text-xs text-slate-500">
          Lat: {pos[0].toFixed(8)} · Long: {pos[1].toFixed(8)}
        </p>
      )}
    </div>
  );
}
