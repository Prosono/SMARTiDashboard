import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./homeMap.css";

export type MapZone = {
  id?: string;
  name: string;
  latitude: number;
  longitude: number;
  radius: number;
  passive: boolean;
};
const noZones: MapZone[] = [];
type Point = { latitude: number; longitude: number };
export function HomeMap({
  latitude,
  longitude,
  name,
  lang,
  radius,
  onChange,
  zones = noZones,
}: Point & {
  name: string;
  lang: string;
  radius?: number;
  zones?: MapZone[];
  onChange?: (point: Point) => void;
}) {
  const element = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const marker = useRef<L.Marker | null>(null);
  const circle = useRef<L.Circle | null>(null);
  const zoneLayers = useRef<L.FeatureGroup | null>(null);
  const change = useRef(onChange);
  change.current = onChange;
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const editable = !!onChange;
  useEffect(() => {
    if (!element.current) return;
    const m = L.map(element.current, {
      scrollWheelZoom: false,
      attributionControl: true,
    }).setView([latitude, longitude], 15);
    map.current = m;
    const tiles = L.tileLayer(
      "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
      {
        maxZoom: 19,
        referrerPolicy: "origin",
        attribution:
          '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>',
      },
    ).addTo(m);
    tiles.on("tileerror", () => setFailed(true));
    tiles.on("tileload", () => {
      setFailed(false);
      setLoaded(true);
    });
    const pin = L.marker([latitude, longitude], {
      draggable: editable,
      title: name,
      alt: lang === "en" ? "Location marker" : "Plasseringsmarkør",
      icon: L.divIcon({
        className: "smarti-map-pin",
        html: '<span aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m3 10 9-7 9 7v10H3Z"/><path d="M9 20v-7h6v7"/></svg></span>',
        iconSize: [40, 40],
        iconAnchor: [20, 40],
      }),
    }).addTo(m);
    marker.current = pin;
    zoneLayers.current = L.featureGroup().addTo(m);
    circle.current = L.circle([latitude, longitude], {
      radius: radius ?? 0,
      color: "var(--orange)",
      weight: 2,
      fillOpacity: 0.12,
    }).addTo(m);
    pin.on("dragend", () => {
      const p = pin.getLatLng();
      change.current?.({
        latitude: Number(p.lat.toFixed(6)),
        longitude: Number(p.wrap().lng.toFixed(6)),
      });
    });
    m.on("click", (event: L.LeafletMouseEvent) => {
      if (change.current)
        change.current({
          latitude: Number(event.latlng.lat.toFixed(6)),
          longitude: Number(event.latlng.wrap().lng.toFixed(6)),
        });
    });
    const observer = new ResizeObserver(() => m.invalidateSize());
    observer.observe(element.current);
    return () => {
      observer.disconnect();
      m.remove();
      map.current = null;
    };
    // A map is created once; draft updates move its layers without resetting zoom.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editable]);
  useEffect(() => {
    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      Math.abs(latitude) > 90 ||
      Math.abs(longitude) > 180
    )
      return;
    const p: L.LatLngExpression = [latitude, longitude];
    marker.current?.setLatLng(p);
    circle.current
      ?.setLatLng(p)
      .setRadius(Number.isFinite(radius) ? Math.max(0, radius!) : 0);
    if (map.current && !map.current.getBounds().contains(p))
      map.current.panTo(p, { animate: false });
  }, [latitude, longitude, radius]);
  useEffect(() => {
    const layers = zoneLayers.current;
    const m = map.current;
    if (!layers || !m) return;
    layers.clearLayers();
    for (const zone of zones) {
      if (
        !Number.isFinite(zone.latitude) ||
        !Number.isFinite(zone.longitude) ||
        Math.abs(zone.latitude) > 90 ||
        Math.abs(zone.longitude) > 180 ||
        !Number.isFinite(zone.radius) ||
        zone.radius < 0
      )
        continue;
      const label = document.createElement("span");
      label.textContent = `${zone.name} · ${zone.radius} m${zone.passive ? (lang === "en" ? " · Automations only" : " · Kun automasjoner") : ""}`;
      L.circle([zone.latitude, zone.longitude], {
        radius: zone.radius,
        color: "var(--accent)",
        weight: 2,
        fillOpacity: 0.16,
        dashArray: zone.passive ? "5 5" : undefined,
        className: "smarti-map-zone",
        bubblingMouseEvents: false,
      })
        .bindTooltip(label, {
          permanent: true,
          direction: "top",
          className: "smarti-zone-label",
        })
        .addTo(layers);
    }
    if (!editable && layers.getLayers().length) {
      const bounds = layers.getBounds();
      if (marker.current) bounds.extend(marker.current.getLatLng());
      m.fitBounds(bounds, { padding: [40, 40], maxZoom: 15, animate: false });
    }
  }, [zones, editable, lang, latitude, longitude]);
  return (
    <div className="home-location-map">
      <div
        ref={element}
        className="home-map-canvas"
        aria-label={`${lang === "en" ? "Map" : "Kart"} · ${name}`}
      />
      <div className="home-map-caption">
        <small>
          {failed
            ? lang === "en"
              ? "Map unavailable. Coordinates can still be edited."
              : "Kartet er utilgjengelig. Koordinater kan fortsatt redigeres."
            : !loaded
              ? lang === "en"
                ? "Loading map …"
                : "Henter kart …"
              : editable
                ? lang === "en"
                  ? "Drag the marker or tap the map. Save to apply."
                  : "Dra markøren eller trykk i kartet. Lagre for å bekrefte."
                : lang === "en"
                  ? "Your home, on the map"
                  : "Ditt hjem, på kartet"}
        </small>
        <button
          type="button"
          disabled={
            !Number.isFinite(latitude) ||
            !Number.isFinite(longitude) ||
            Math.abs(latitude) > 90 ||
            Math.abs(longitude) > 180
          }
          onClick={() => {
            const layers = zoneLayers.current;
            if (!editable && layers?.getLayers().length) {
              const bounds = layers.getBounds().extend([latitude, longitude]);
              map.current?.fitBounds(bounds, {
                padding: [40, 40],
                maxZoom: 15,
                animate: false,
              });
            } else map.current?.setView([latitude, longitude], 15);
          }}
        >
          {!editable && zones.length
            ? lang === "en"
              ? "Show all zones"
              : "Vis alle soner"
            : lang === "en"
              ? "Center"
              : "Sentrer"}
        </button>
      </div>
    </div>
  );
}
