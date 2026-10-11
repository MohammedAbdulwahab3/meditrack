"use client";

import "leaflet/dist/leaflet.css";
import type * as Leaflet from "leaflet";
import { useEffect, useRef, useState } from "react";
import type { LatLng } from "@/lib/medicine";

// Esri World Street Map: clear street names and no API key. Note the {y}/{x} order.
const TILE_URL = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}";
const ATTRIBUTION = "Tiles © Esri — HERE, Garmin, © OpenStreetMap contributors";

export interface MapPin {
  id: string;
  lat: number;
  lng: number;
  label: string;
  /** Straight-line distance from the viewer, used to keep far-away towns out of the overview. */
  km?: number | null;
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** A map of pharmacies with price tags, the viewer's position and an optional route. */
export function PharmacyMap({
  me,
  pins,
  selectedId,
  route,
  approximate,
  onSelect,
  className = "",
}: {
  me: LatLng | null;
  pins: MapPin[];
  selectedId: string | null;
  route: [number, number][] | null;
  approximate?: boolean;
  onSelect: (id: string) => void;
  className?: string;
}) {
  const el = useRef<HTMLDivElement>(null);
  const ctx = useRef<{ L: typeof Leaflet; map: Leaflet.Map; layer: Leaflet.LayerGroup } | null>(null);
  const lastFit = useRef("");
  const onSelectRef = useRef(onSelect);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  // Create the map once (Leaflet needs `window`, so it loads on the client only).
  useEffect(() => {
    let cancelled = false;
    import("leaflet").then((L) => {
      if (cancelled || !el.current) return;
      const map = L.map(el.current, { zoomControl: true, scrollWheelZoom: false }).setView([9.02, 38.75], 12);
      L.tileLayer(TILE_URL, { maxZoom: 20, maxNativeZoom: 19, attribution: ATTRIBUTION }).addTo(map);
      ctx.current = { L, map, layer: L.layerGroup().addTo(map) };
      setReady(true);
    });
    return () => {
      cancelled = true;
      ctx.current?.map.remove();
      ctx.current = null;
      lastFit.current = "";
    };
  }, []);

  // Draw markers and the route.
  useEffect(() => {
    const c = ctx.current;
    if (!ready || !c) return;
    const { L, map, layer } = c;
    layer.clearLayers();
    if (route && route.length > 1) {
      L.polyline(route, { color: "#ffffff", weight: 10, opacity: 0.9 }).addTo(layer);
      L.polyline(route, { color: "#0b7f75", weight: 6, dashArray: approximate ? "12 10" : undefined }).addTo(layer);
    }
    if (me) {
      L.marker([me.lat, me.lng], {
        icon: L.divIcon({ className: "", html: '<div class="mt-me"></div>', iconSize: [18, 18], iconAnchor: [9, 9] }),
        interactive: false,
        keyboard: false,
      }).addTo(layer);
    }
    for (const p of pins) {
      const selected = p.id === selectedId;
      L.marker([p.lat, p.lng], {
        icon: L.divIcon({
          className: "",
          html: `<div class="mt-pin${selected ? " mt-pin--selected" : ""}"><span class="mt-pin__tag"><span class="mt-pin__dot"></span>${escapeHtml(p.label)}</span><span class="mt-pin__tail"></span></div>`,
          iconSize: [110, 44],
          iconAnchor: [55, 44],
        }),
        zIndexOffset: selected ? 1000 : 0,
        title: p.label,
      })
        .on("click", () => onSelectRef.current(p.id))
        .addTo(layer);
    }

    // Re-frame only when what we are showing changes, not on every render.
    const key = route && route.length > 1 ? `route:${selectedId}:${route.length}` : `overview:${pins.length}:${me ? "me" : ""}`;
    if (key === lastFit.current) return;
    lastFit.current = key;
    const points: [number, number][] =
      route && route.length > 1
        ? [...route, ...(me ? [[me.lat, me.lng] as [number, number]] : [])]
        : [
            ...(me ? [[me.lat, me.lng] as [number, number]] : []),
            ...pins.filter((p) => p.km == null || p.km < 40).map((p) => [p.lat, p.lng] as [number, number]),
          ];
    if (points.length >= 2) map.fitBounds(L.latLngBounds(points), { padding: [48, 48], maxZoom: 16 });
    else if (points.length === 1) map.setView(points[0], 15);
  }, [ready, me, pins, selectedId, route, approximate]);

  return <div ref={el} className={`z-0 ${className}`} role="region" aria-label="Map of pharmacies" />;
}
