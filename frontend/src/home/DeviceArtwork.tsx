import { useContext, useState, type ElementType } from "react";
import type { Control } from "../types";
import { CardIcon, CardPresentation, cardImageURL } from "./CardPresentation";
import { EquipmentArtwork } from "./EquipmentArtwork";
import { isAirConditioner } from "./equipmentModel";
import { mediaDeviceArtwork } from "./mediaDeviceArtwork";
import { deviceAppearance } from "./deviceAppearance";
import { sensorDeviceArtwork } from "./sensorDeviceArtwork";

/** Compact inventory visual, using the same artwork and icon choices as cards. */
export function DeviceArtwork({
  c,
  available = true,
  size,
  fallback,
}: {
  c: Control;
  available?: boolean;
  size?: number;
  fallback?: ElementType;
}) {
  const { image } = useContext(CardPresentation);
  const [failed, setFailed] = useState<string[]>([]);
  const { Icon: DefaultIcon } = deviceAppearance(c);
  const Icon = fallback || DefaultIcon;
  const custom = image && image !== "auto";
  const url = custom
    ? cardImageURL(image)
    : c.domain === "sensor"
      ? sensorDeviceArtwork(c)
      : c.domain === "media_player"
        ? mediaDeviceArtwork(c)
        : c.domain === "vacuum"
          ? new URL("home/equipment/vacuum-dock.webp", document.baseURI).href
          : c.domain === "calendar"
            ? new URL("home/equipment/calendar.webp", document.baseURI).href
            : null;
  const equipment =
    !custom &&
    [
      "light",
      "switch",
      "input_boolean",
      "climate",
      "lock",
      "cover",
      "binary_sensor",
      "fan",
      "alarm_control_panel",
    ].includes(c.domain);
  return (
    <span
      className="device-product-art"
      aria-hidden="true"
      data-artwork-entity={c.entity_id}
      style={
        size === undefined
          ? undefined
          : { width: size, height: size, flex: "none", display: "grid" }
      }
    >
      {url && !failed.includes(url) ? (
        <img
          src={url}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
          onError={() => setFailed((current) => [...current, url])}
        />
      ) : equipment ? (
        <EquipmentArtwork
          c={c}
          compact
          kind={isAirConditioner(c) ? "air-conditioner" : undefined}
          available={available && c.availability === "available"}
        />
      ) : (
        <CardIcon fallback={Icon} size={24} strokeWidth={1.5} />
      )}
    </span>
  );
}
