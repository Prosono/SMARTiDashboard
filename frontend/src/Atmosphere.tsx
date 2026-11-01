import {
  createContext,
  useContext,
  useEffect,
  useId,
  useState,
  type ReactNode,
} from "react";
import { readPreference, writePreference } from "./preferences";
import "./atmosphere.css";

const Motion = createContext({
  mode: "flow",
  change: (_mode: string) => {},
  hidden: false,
});

export function AtmosphereProvider({ children }: { children: ReactNode }) {
  const [mode, change] = useState(() =>
    readPreference("smarti-background-motion", "flow", ["flow", "still"]),
  );
  const [hidden, setHidden] = useState(() => document.hidden);
  useEffect(() => {
    writePreference("smarti-background-motion", mode);
  }, [mode]);
  useEffect(() => {
    const visibility = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", visibility);
    return () => document.removeEventListener("visibilitychange", visibility);
  }, []);
  return (
    <Motion.Provider value={{ mode, change, hidden }}>
      {children}
    </Motion.Provider>
  );
}

// Tapered, translucent ribbons with iridescent edges, like the supplied reference.
// Their geometry stays static; only three containing layers animate.
const ribbons = [
  "M-160 170 C90 180 225 440 450 395 C610 360 650 65 780 185 C1010 390 1270 435 1760 260 L1760 267 C1280 475 1030 440 775 230 C665 125 625 410 455 425 C225 475 85 200 -160 170 Z",
  "M-160 365 C135 300 295 310 480 270 C655 230 650 130 800 220 C1005 340 1280 300 1760 330 L1760 334 C1260 325 1000 395 795 260 C670 170 655 275 485 295 C280 330 110 325 -160 365 Z",
];

export function Atmosphere({ embedded = false }: { embedded?: boolean }) {
  const id = useId().replaceAll(":", ""),
    motion = useContext(Motion);
  return (
    <div
      className={`atmosphere${embedded ? " atmosphere-embedded" : ""}`}
      aria-hidden="true"
      inert
      data-paused={motion.hidden || motion.mode === "still"}
    >
      {["red", "green", "blue"].map((color) => (
        <div className={`atmosphere-wave atmosphere-${color}`} key={color}>
          <svg viewBox="0 0 1600 600" preserveAspectRatio="none">
            <defs>
              <linearGradient
                id={`${id}-${color}-spectrum`}
                gradientUnits="userSpaceOnUse"
                x1="-160"
                x2="1760"
              >
                <stop stopColor="var(--atmosphere-blue)" stopOpacity="0" />
                <stop offset=".13" stopColor="var(--atmosphere-blue)" />
                <stop offset=".25" stopColor="var(--atmosphere-red)" />
                <stop offset=".39" stopColor="var(--atmosphere-red)" />
                <stop offset=".46" stopColor="var(--atmosphere-amber)" />
                <stop offset=".51" stopColor="var(--atmosphere-green)" />
                <stop offset=".59" stopColor="var(--atmosphere-cyan)" />
                <stop offset=".72" stopColor="var(--atmosphere-blue)" />
                <stop offset=".87" stopColor="var(--atmosphere-violet)" />
                <stop
                  offset="1"
                  stopColor="var(--atmosphere-red)"
                  stopOpacity="0"
                />
              </linearGradient>
              <filter
                id={`${id}-${color}-glow`}
                x="-8%"
                y="-20%"
                width="116%"
                height="140%"
                colorInterpolationFilters="sRGB"
              >
                <feGaussianBlur stdDeviation="6" />
              </filter>
            </defs>
            <g
              fill="none"
              stroke={`url(#${id}-${color}-spectrum)`}
              strokeWidth="10"
              opacity=".24"
              filter={`url(#${id}-${color}-glow)`}
            >
              {ribbons.map((d, index) => (
                <path key={index} d={d} />
              ))}
            </g>
            <g
              fill={`url(#${id}-${color}-spectrum)`}
              fillOpacity=".18"
              stroke={`url(#${id}-${color}-spectrum)`}
              strokeWidth="1.4"
            >
              {ribbons.map((d, index) => (
                <path key={index} d={d} />
              ))}
            </g>
          </svg>
        </div>
      ))}
    </div>
  );
}

export function BackgroundMotionSetting({ lang }: { lang: string }) {
  const motion = useContext(Motion),
    en = lang === "en";
  return (
    <>
      <label>
        {en ? "Background motion" : "Bakgrunnsbevegelse"}
        <select
          value={motion.mode}
          onChange={(event) => motion.change(event.target.value)}
        >
          <option value="flow">
            {en ? "Gentle RGB waves" : "Rolige RGB-bølger"}
          </option>
          <option value="still">{en ? "Still" : "Stillestående"}</option>
        </select>
      </label>
      <p className="note">
        {en
          ? "Flowing RGB ribbons follow your theme throughout the app. Your device’s reduced motion setting is respected."
          : "Flytende RGB-fargebånd følger temaet ditt i hele appen. Enhetens valg for redusert bevegelse respekteres."}
      </p>
    </>
  );
}
