import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import {
  BatteryCharging,
  CarFront,
  House,
  Sun,
  UtilityPole,
} from "lucide-react";
import house from "../assets/energy-house-bare.webp";
import equipmentArt from "../assets/energy-house-harmoni.webp";
import {
  isEvCharging,
  type FlowRole,
  type FlowSnapshot,
} from "./energyFlowModel";

const hotspotOrder = ["grid", "solar", "ev", "battery", "home"] as const;
const connectionRoles = ["grid", "solar", "ev", "battery"] as const;
const icons = {
  grid: UtilityPole,
  solar: Sun,
  ev: CarFront,
  battery: BatteryCharging,
  home: House,
};
type ConnectionRole = (typeof connectionRoles)[number];
type RoutePaths = Partial<Record<ConnectionRole, SVGPathElement | null>>;
type Reading = { label: string; value: string; detail: string };
type Point = readonly [number, number];
type PictureLayout = {
  width: number;
  height: number;
  connections: {
    role: ConnectionRole;
    x: number;
    y: number;
    leader: string;
    route: string;
  }[];
};

// Fractional coordinates track the pictured equipment at any render size.
const terminals = {
  grid: [0.64, 0.613],
  solar: [0.595, 0.267],
  ev: [0.276, 0.63],
  battery: [0.8, 0.704],
} satisfies Record<ConnectionRole, [number, number]>;

function roundedPath(points: Point[], radius = 14) {
  const path = [`M ${points[0].join(" ")}`];
  const inset = ([x, y]: Point, [towardX, towardY]: Point) => {
    const length = Math.hypot(towardX - x, towardY - y);
    const fraction = length ? Math.min(radius / length, 0.5) : 0;
    return `${x + (towardX - x) * fraction} ${y + (towardY - y) * fraction}`;
  };
  for (let i = 1; i < points.length - 1; i++) {
    const corner = points[i];
    path.push(
      `L ${inset(corner, points[i - 1])}`,
      `Q ${corner.join(" ")} ${inset(corner, points[i + 1])}`,
    );
  }
  path.push(`L ${points[points.length - 1].join(" ")}`);
  return path.join(" ");
}

function FlowPulse({
  paths,
  role,
  route,
  reverse,
  measuredAt,
  watts,
}: {
  paths: RefObject<RoutePaths>;
  role: ConnectionRole;
  route: string;
  reverse: boolean;
  measuredAt: string | null;
  watts: number;
}) {
  const dot = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const path = paths.current[role];
    const element = dot.current;
    if (!path || !element?.animate) return;
    const length = path.getTotalLength();
    if (!(length > 0)) return;
    const segments = Math.min(25, Math.max(4, Math.ceil(length / 12)));
    const frames = Array.from({ length: segments + 1 }, (_, index) => {
      const offset = index / segments;
      const { x, y } = path.getPointAtLength(
        length * (reverse ? 1 - offset : offset),
      );
      return {
        offset,
        transform: `translate3d(${x}px, ${y}px, 0)`,
        opacity: index === 0 || index === segments ? 0 : 1,
      };
    });
    // Keep the route itself static. Only this small dot moves once per reading.
    const animation = element.animate(frames, { duration: 850 });
    return () => animation.cancel();
  }, [paths, role, route, reverse, measuredAt, watts]);
  return <span ref={dot} className="energy-picture-pulse" aria-hidden="true" />;
}

export function EnergyPicture({
  flows,
  animate,
  lang,
  readings,
  onConfigure,
  canConfigure,
}: {
  flows: FlowSnapshot;
  animate: boolean;
  lang: string;
  readings: Record<FlowRole, Reading>;
  onConfigure: (role: FlowRole) => void;
  canConfigure: boolean;
}) {
  const id = useId();
  const stage = useRef<HTMLDivElement>(null);
  const picture = useRef<HTMLImageElement>(null);
  const paths = useRef<RoutePaths>({});
  const buttons = useRef<Partial<Record<FlowRole, HTMLButtonElement | null>>>(
    {},
  );
  const [layout, setLayout] = useState<PictureLayout | null>(null);
  const [motionVisible, setMotionVisible] = useState(false);
  const visible = hotspotOrder.filter((role) => flows[role].visible);
  const visibleKey = visible.join(",");
  const charging = isEvCharging(flows.ev);
  const equipment = [
    flows.grid.visible && "grid",
    flows.solar.visible && "solar",
    flows.battery.visible && "battery",
    flows.ev.visible && (charging ? "car" : "charger"),
  ];
  const en = lang === "en";

  useEffect(() => {
    const image = picture.current;
    if (!image) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let inView = false;
    function syncVisibility() {
      setMotionVisible(inView && !document.hidden && !reducedMotion.matches);
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        inView = entry.isIntersecting && entry.intersectionRatio >= 0.1;
        syncVisibility();
      },
      { threshold: 0.1 },
    );
    observer.observe(image);
    document.addEventListener("visibilitychange", syncVisibility);
    reducedMotion.addEventListener("change", syncVisibility);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", syncVisibility);
      reducedMotion.removeEventListener("change", syncVisibility);
    };
  }, []);

  useLayoutEffect(() => {
    const container = stage.current;
    const image = picture.current;
    if (!container || !image) return;
    function measure() {
      if (!container || !image) return;
      const compact = container.clientWidth < 620;
      container.dataset.layout = compact ? "compact" : "wide";
      if (!image.naturalWidth) {
        setLayout(null);
        return;
      }
      const bounds = container.getBoundingClientRect();
      const photo = image.getBoundingClientRect();
      const point = (x: number, y: number): Point =>
        [
          photo.left - bounds.left + x * photo.width,
          photo.top - bounds.top + y * photo.height,
        ] as const;
      const connections = connectionRoles.flatMap((role) => {
        const button = buttons.current[role];
        if (!button) return [];
        const tile = button.getBoundingClientRect();
        const left = role === "grid" || role === "ev";
        const sx = (left ? tile.right : tile.left) - bounds.left;
        const sy = (tile.top + tile.bottom) / 2 - bounds.top;
        const [x, y] = point(...terminals[role]);
        const bend = sx + (x - sx) * 0.55;
        const leader = compact
          ? ""
          : roundedPath([
              [sx, sy],
              [bend, sy],
              [bend, y],
              [x, y],
            ]);
        const routes: Record<ConnectionRole, Point[]> = {
          grid: [[0.672, 0.43], [0.64, 0.43], terminals.grid],
          solar: [terminals.solar, [0.48, 0.267], [0.48, 0.54]],
          ev: [[0.43, 0.71], [0.43, 0.853], [0.276, 0.853], terminals.ev],
          battery: [
            [0.55, 0.718],
            [0.55, 0.87],
            [0.8, 0.87],
            terminals.battery,
          ],
        };
        const route =
          role === "grid" && leader
            ? leader
            : roundedPath(
                routes[role].map(([px, py]) => point(px, py)),
                compact ? 7 : 14,
              );
        return [{ role, x, y, leader, route }];
      });
      setLayout({ width: bounds.width, height: bounds.height, connections });
    }
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    observer.observe(image);
    for (const button of Object.values(buttons.current)) {
      if (button) observer.observe(button);
    }
    image.addEventListener("load", measure);
    measure();
    return () => {
      observer.disconnect();
      image.removeEventListener("load", measure);
    };
  }, [visibleKey]);

  const connections = layout?.connections.map((connection) => {
    const { role } = connection;
    const flow = flows[role];
    const watts = flow.watts ?? 0;
    return {
      ...connection,
      watts,
      measuredAt: flow.measured_at,
      active:
        flow.visible &&
        (role === "ev"
          ? charging
          : flow.status === "ok" && Math.abs(watts) > 0.5),
      reverse: role === "battery" ? watts > 0 : watts < 0,
    };
  });

  return (
    <div className="energy-scene-wrap">
      <div ref={stage} className="energy-scene-stage">
        <div className="energy-scene">
          <div className="energy-picture-art">
            <img
              ref={picture}
              className="energy-scene-picture"
              src={house}
              width={1774}
              height={887}
              alt={
                en
                  ? "Illustration of the energy home"
                  : "Illustrasjon av energihuset"
              }
              decoding="async"
              draggable={false}
            />
            {equipment.map(
              (part) =>
                part && (
                  <img
                    key={part}
                    className="energy-picture-equipment"
                    data-picture-equipment={part}
                    src={equipmentArt}
                    width={1774}
                    height={887}
                    alt=""
                    aria-hidden="true"
                    decoding="async"
                    draggable={false}
                  />
                ),
            )}
          </div>
        </div>
        {layout && (
          <svg
            className="energy-hotspot-tethers"
            viewBox={`0 0 ${layout.width} ${layout.height}`}
            aria-hidden="true"
          >
            {connections?.map(
              ({ role, x, y, leader, route, active, reverse }) => {
                const arrow = `${id}-${role}`;
                const marker = `url(#${arrow})`;
                return (
                  <g
                    key={role}
                    className="energy-picture-connection energy-hotspot-anchor"
                    data-role={role}
                  >
                    {active && (
                      <defs>
                        <marker
                          id={arrow}
                          viewBox="0 0 8 8"
                          markerWidth="8"
                          markerHeight="8"
                          refX="12"
                          refY="4"
                          markerUnits="userSpaceOnUse"
                          orient="auto-start-reverse"
                        >
                          <path
                            d="M 2 1 L 6 4 L 2 7"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.5"
                          />
                        </marker>
                      </defs>
                    )}
                    {leader && (!active || role !== "grid") && (
                      <path className="energy-picture-leader" d={leader} />
                    )}
                    {active && (
                      <path
                        ref={(node) => {
                          paths.current[role] = node;
                        }}
                        className="energy-picture-route"
                        d={route}
                        markerStart={reverse ? marker : undefined}
                        markerEnd={reverse ? undefined : marker}
                      />
                    )}
                    <circle
                      className="energy-anchor-ring"
                      cx={x}
                      cy={y}
                      r="5.5"
                    />
                    <circle
                      className="energy-anchor-core"
                      cx={x}
                      cy={y}
                      r="2.5"
                    />
                  </g>
                );
              },
            )}
          </svg>
        )}
        {animate &&
          motionVisible &&
          connections?.map(
            ({ role, active, reverse, route, measuredAt, watts }) =>
              active && (
                <FlowPulse
                  key={role}
                  paths={paths}
                  role={role}
                  route={route}
                  reverse={reverse}
                  measuredAt={measuredAt}
                  watts={watts}
                />
              ),
          )}
        <div className="energy-hotspots">
          {visible.map((role) => {
            const Icon = icons[role];
            const { label, value, detail } = readings[role];
            const action =
              flows[role].status === "unconfigured"
                ? en
                  ? "Add measurement"
                  : "Legg til måling"
                : en
                  ? "View history"
                  : "Vis historikk";
            return (
              <button
                key={role}
                ref={(button) => {
                  buttons.current[role] = button;
                }}
                type="button"
                className="energy-hotspot"
                data-hotspot={role}
                data-status={flows[role].status}
                aria-haspopup="dialog"
                aria-label={`${label}: ${value}. ${detail}. ${action}`}
                title={`${action} · ${label}`}
                disabled={!canConfigure}
                onClick={() => onConfigure(role)}
              >
                <span className="energy-hotspot-icon">
                  <Icon size={19} aria-hidden="true" />
                </span>
                <span className="energy-hotspot-copy">
                  <span>{label}</span>
                  <strong>{value}</strong>
                  <small>{detail}</small>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
