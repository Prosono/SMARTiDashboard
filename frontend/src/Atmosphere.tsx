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

// Two opposing waves with soft crosslinks form one continuous double helix.
// Geometry is created once. Only the three containing color layers move.
const strands = [
  "M-400 300 C-266.667 100 -133.333 100 0 300 S266.667 500 400 300 S666.667 100 800 300 S1066.667 500 1200 300 S1466.667 100 1600 300 S1866.667 500 2000 300",
  "M-400 300 C-266.667 500 -133.333 500 0 300 S266.667 100 400 300 S666.667 500 800 300 S1066.667 100 1200 300 S1466.667 500 1600 300 S1866.667 100 2000 300",
];
const crosslinks = Array.from({ length: 30 }, (_, index) => {
  const x = -360 + index * 80,
    phase = (((x % 400) + 400) % 400) / 400,
    height = 600 * phase * (1 - phase);
  return { x, y1: 300 - height, y2: 300 + height };
});

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
                id={`${id}-${color}-fade`}
                gradientUnits="userSpaceOnUse"
                x1="-200"
                x2="1800"
              >
                <stop stopColor="currentColor" stopOpacity="0" />
                <stop offset=".22" stopColor="currentColor" />
                <stop offset=".78" stopColor="currentColor" />
                <stop offset="1" stopColor="currentColor" stopOpacity="0" />
              </linearGradient>
              <filter
                id={`${id}-${color}-soft`}
                x="-10%"
                y="-50%"
                width="120%"
                height="200%"
                colorInterpolationFilters="sRGB"
              >
                <feGaussianBlur stdDeviation="26" />
              </filter>
              <filter
                id={`${id}-${color}-thread`}
                x="-5%"
                y="-15%"
                width="110%"
                height="130%"
                colorInterpolationFilters="sRGB"
              >
                <feGaussianBlur stdDeviation="3.5" />
              </filter>
            </defs>
            <g
              className="atmosphere-helix-glow"
              fill="none"
              stroke={`url(#${id}-${color}-fade)`}
              strokeWidth="76"
              opacity=".8"
              filter={`url(#${id}-${color}-soft)`}
            >
              {strands.map((d, index) => (
                <path key={index} d={d} />
              ))}
            </g>
            <g
              className="atmosphere-helix-thread"
              fill="none"
              stroke={`url(#${id}-${color}-fade)`}
              strokeWidth="7"
              opacity=".7"
              filter={`url(#${id}-${color}-thread)`}
            >
              {strands.map((d, index) => (
                <path key={index} d={d} />
              ))}
              <g strokeWidth="4" strokeLinecap="round" opacity=".52">
                {crosslinks.map(({ x, y1, y2 }) => (
                  <line key={x} x1={x} x2={x} y1={y1} y2={y2} />
                ))}
              </g>
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
          ? "Soft, intertwined RGB waves follow your theme throughout the app. Your device’s reduced motion setting is respected."
          : "Myke RGB-bølger slynger seg rundt hverandre og følger temaet ditt i hele appen. Enhetens valg for redusert bevegelse respekteres."}
      </p>
    </>
  );
}
