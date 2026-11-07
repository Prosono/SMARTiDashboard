import { memo, useMemo } from "react";
import type { Home } from "../types";
import { DeviceArtwork } from "../home/DeviceArtwork";
import { flowArtworkTargets } from "./flowArtworkModel";
import { flowIcon, type FlowKind } from "./flowPresentation";
import "./flowArtwork.css";

export const FlowArtwork = memo(function FlowArtwork({
  row,
  kind,
  home,
  size = 32,
}: {
  row: unknown;
  kind: FlowKind;
  home: Home;
  size?: number;
}) {
  const target = useMemo(() => flowArtworkTargets(row, home), [row, home]);
  const Icon = flowIcon(row, kind, home);
  return (
    <span
      className="flow-step-art"
      aria-hidden="true"
      data-art-targets={target.count}
      style={{ width: size, height: size, flex: "none" }}
    >
      {target.control ? (
        <DeviceArtwork c={target.control} size={size} fallback={Icon} />
      ) : (
        <Icon size={22} />
      )}
      {target.control && (target.count === null || target.count > 1) && (
        <span className="flow-art-count">
          +{target.count === null ? "" : target.count - 1}
        </span>
      )}
    </span>
  );
});
