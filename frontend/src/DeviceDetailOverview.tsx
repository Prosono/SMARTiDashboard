import { MapPin, Star } from "lucide-react";
import type { Control, Home } from "./types";
import { CardDeviceMetadata } from "./home/CardDeviceMetadata";
import { DeviceArtwork } from "./home/DeviceArtwork";

export function DeviceDetailOverview({
  control,
  home,
  room,
  offline,
  lang,
  favorite,
  onFavorite,
}: {
  control: Control;
  home: Home;
  room: string;
  offline: boolean;
  lang: string;
  favorite: boolean;
  onFavorite: () => void;
}) {
  const en = lang === "en";
  const available = !offline && control.availability === "available";
  const updated = control.updated_at ? new Date(control.updated_at) : null;

  return (
    <header className="device-detail-overview" data-available={available}>
      <div className="device-detail-portrait">
        <DeviceArtwork c={control} available={available} />
      </div>
      <div className="device-detail-identity">
        <h3>{control.name}</h3>
        <CardDeviceMetadata
          control={control}
          home={home}
          lang={lang}
          available={!offline}
        />
        <div className="device-detail-room">
          <MapPin size={15} aria-hidden="true" />
          {room}
        </div>
        <div className="device-detail-badges">
          <span className="device-detail-connection">
            {offline
              ? en
                ? "Connection lost"
                : "Mistet forbindelsen"
              : available
                ? en
                  ? "Connected"
                  : "Tilkoblet"
                : en
                  ? "Unavailable"
                  : "Utilgjengelig"}
          </span>
        </div>
        {updated && Number.isFinite(updated.valueOf()) && (
          <small className="control-updated">
            {en ? "Last updated" : "Sist oppdatert"}{" "}
            <time dateTime={updated.toISOString()}>
              {updated.toLocaleString(en ? "en-GB" : "nb-NO", {
                dateStyle: "short",
                timeStyle: "short",
              })}
            </time>
          </small>
        )}
      </div>
      <button
        type="button"
        className="device-detail-favorite"
        aria-label={`${en ? "Favorite" : "Favoritt"}: ${control.name}`}
        aria-pressed={favorite}
        onClick={onFavorite}
      >
        <Star size={21} aria-hidden="true" />
      </button>
    </header>
  );
}
