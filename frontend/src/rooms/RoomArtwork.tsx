import type { ImgHTMLAttributes } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
import type { HomePreferences } from "../home/HomeOverview";

export function RoomArtwork({
  src,
  style,
  roomId,
  ...props
}: ImgHTMLAttributes<HTMLImageElement> & { roomId?: string }) {
  const prefs = useQuery({
    queryKey: ["home-preferences"],
    queryFn: () => api<HomePreferences>("home/preferences"),
  });
  const matched = src?.match(/room-image\/([^?]+)/);
  const id = roomId || (matched ? decodeURIComponent(matched[1]) : undefined);
  const icon = id ? prefs.data?.icons?.[id] : undefined;
  const image =
    id && prefs.data?.images[id]
      ? new URL(
          `api/home/room-image/${encodeURIComponent(id)}?v=${prefs.dataUpdatedAt}`,
          document.baseURI,
        ).href
      : src;
  return (
    <img
      {...props}
      src={image}
      data-room-icon={icon ? "true" : undefined}
      style={
        icon
          ? {
              ...style,
              objectFit: "contain",
              padding: "12px",
              boxSizing: "border-box",
            }
          : style
      }
    />
  );
}
