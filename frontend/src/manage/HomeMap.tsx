import { useState } from "react";
export function HomeMap({
  latitude,
  longitude,
  name,
  lang,
}: {
  latitude: number;
  longitude: number;
  name: string;
  lang: string;
}) {
  const [failed, setFailed] = useState(false);
  const lat = Math.max(-85, Math.min(85, latitude)),
    lon = Math.max(-180, Math.min(180, longitude));
  const query = new URLSearchParams({
    bbox: [
      Math.max(-180, lon - 0.012),
      Math.max(-85, lat - 0.006),
      Math.min(180, lon + 0.012),
      Math.min(85, lat + 0.006),
    ].join(","),
    layer: "mapnik",
    marker: `${latitude},${longitude}`,
  });
  return (
    <div className="home-location-map">
      {!failed && (
        <iframe
          key={`${latitude},${longitude}`}
          title={`${lang === "en" ? "Map" : "Kart"} · ${name}`}
          src={`https://www.openstreetmap.org/export/embed.html?${query}`}
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      )}
      <small>
        {failed
          ? lang === "en"
            ? "Map unavailable. "
            : "Kartet er utilgjengelig. "
          : ""}
        <a
          href={`https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=16/${latitude}/${longitude}`}
          target="_blank"
          rel="noreferrer"
        >
          {lang === "en" ? "Open map" : "Åpne kart"}
        </a>{" "}
        · © OpenStreetMap{" "}
        {lang === "en"
          ? "contributors · Internet required"
          : "bidragsytere · Krever internett"}
      </small>
    </div>
  );
}
