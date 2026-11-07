import type { ExperienceMode } from "./Experience";

/** One visual language for progressively more detailed views, not permissions. */
export function ExperienceModeIcon({ mode }: { mode: ExperienceMode }) {
  return (
    <svg
      className="experience-mode-icon"
      data-mode-icon={mode}
      width="56"
      height="56"
      viewBox="0 0 48 48"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="4" y="6" width="40" height="36" rx="6" />
      <path d="M4 15h40" />
      <circle cx="10" cy="10.5" r="1" fill="currentColor" stroke="none" />
      <circle
        cx="14"
        cy="10.5"
        r="1"
        fill="currentColor"
        stroke="none"
        opacity=".45"
      />
      {mode === "simple" ? (
        <>
          <rect
            x="11"
            y="21"
            width="26"
            height="15"
            rx="4"
            fill="currentColor"
            fillOpacity=".1"
          />
          <path d="m17 28 7-5 7 5M19 27v6h10v-6m-7 6v-4h4v4" />
        </>
      ) : mode === "normal" ? (
        <>
          <rect
            x="10"
            y="21"
            width="12"
            height="15"
            rx="2.5"
            fill="currentColor"
            fillOpacity=".1"
          />
          <rect x="27" y="21" width="11" height="5" rx="2" />
          <rect
            x="27"
            y="31"
            width="11"
            height="5"
            rx="2"
            fill="currentColor"
            fillOpacity=".1"
          />
        </>
      ) : (
        <>
          <path d="M11 22h7m6 0h13M11 29h17m6 0h3M11 36h3m6 0h17" />
          <circle cx="21" cy="22" r="3" fill="currentColor" fillOpacity=".12" />
          <circle cx="31" cy="29" r="3" fill="currentColor" fillOpacity=".12" />
          <circle cx="17" cy="36" r="3" fill="currentColor" fillOpacity=".12" />
        </>
      )}
    </svg>
  );
}
