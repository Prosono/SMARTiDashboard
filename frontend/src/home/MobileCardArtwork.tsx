import { useState } from "react";
import { Bot, ImageOff } from "lucide-react";
import type { MobileCardProps } from "./MobileCardTile";
import { cardImageURL, photoImages } from "./CardPresentation";
import { EquipmentArtwork } from "./EquipmentArtwork";
import { mediaDeviceArtwork } from "./mediaDeviceArtwork";
import { usable } from "./homeModel";

/** The same local cutouts and state-aware illustrations used by the larger cards. */
export function MobileCardArtwork({
  card,
  config,
  home,
  offline,
}: MobileCardProps) {
  const [failed, setFailed] = useState("");
  if (
    config?.image === "none" ||
    photoImages.has(config?.image || "") ||
    config?.type === "picture"
  )
    return null;
  const custom =
    config?.image && config.image !== "auto"
      ? cardImageURL(config.image)
      : undefined;
  const source = config?.sources[0] || card.entityId;
  const control = home.controls.find((c) => c.entity_id === source);
  const lights =
    !source && card.id === "lighting"
      ? home.controls
          .filter((c) => c.domain === "light" && !c.diagnostic)
          .slice(0, 3)
      : [];
  let image = custom;
  if (!image && control?.domain === "vacuum")
    image = new URL("home/equipment/vacuum-dock.webp", document.baseURI).href;
  if (!image && control?.domain === "media_player")
    image = mediaDeviceArtwork(control) || undefined;
  const equipment =
    control &&
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
    ].includes(control.domain);
  if (!image && !equipment && !lights.length) return null;
  return (
    <span
      className="mobile-card-product"
      data-group={lights.length > 1 || undefined}
      data-unavailable={
        offline || !home.connected || (control && !usable(control)) || undefined
      }
      aria-hidden="true"
    >
      {image && image !== failed ? (
        <img
          src={image}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
          onError={() => setFailed(image)}
        />
      ) : image && image === failed ? (
        control?.domain === "vacuum" ? (
          <Bot />
        ) : (
          <ImageOff />
        )
      ) : equipment ? (
        <EquipmentArtwork
          c={control}
          available={!offline && home.connected && usable(control)}
        />
      ) : (
        lights.map((c) => (
          <EquipmentArtwork
            key={c.entity_id}
            c={c}
            kind="pendant"
            available={!offline && home.connected && usable(c)}
          />
        ))
      )}
    </span>
  );
}
