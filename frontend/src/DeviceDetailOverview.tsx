import { Battery, MapPin, Star } from "lucide-react";
import type { Control } from "./types";
import { DeviceArtwork } from "./home/DeviceArtwork";
import { controlState } from "./controlState";

export function DeviceDetailOverview({
  control,
  room,
  offline,
  lang,
  battery,
  favorite,
  onFavorite,
}: {
  control: Control;
  room: string;
  offline: boolean;
  lang: string;
  battery?: Control;
  favorite: boolean;
  onFavorite: () => void;
}) {
  const en = lang === "en";
  const available = !offline && control.availability === "available";
  const updated = control.updated_at ? new Date(control.updated_at) : null;
  const batteryState =
    battery &&
    controlState(
      battery,
      battery.availability === "available"
        ? battery.state
        : battery.availability,
      lang,
    );

  return (
    <header className="device-detail-overview" data-available={available}>
      <div className="device-detail-portrait">
        <DeviceArtwork c={control} available={available} />
      </div>
      <div className="device-detail-identity">
        <h3>{control.name}</h3>
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
          {battery && (
            <span className="device-detail-battery">
              <Battery size={17} aria-hidden="true" />
              <span
                className={
                  battery.availability === "available" ? "sr-only" : undefined
                }
              >
                {en ? "Battery" : "Batteri"}
                {battery.availability !== "available" ? ":" : " "}
              </span>
              {batteryState}
              {battery.availability === "available" &&
              !String(batteryState).includes("%")
                ? " %"
                : ""}
            </span>
          )}
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
