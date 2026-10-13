import { useEffect, useRef, type ReactNode, type CSSProperties } from "react";
import { House, Lightbulb, Zap, Shield, Thermometer } from "lucide-react";
export const homeTabs = [
  { id: "overview", nb: "Oversikt", en: "Overview", Icon: House },
  { id: "lights", nb: "Lys", en: "Lights", Icon: Lightbulb },
  { id: "energy", nb: "Energi", en: "Energy", Icon: Zap },
  { id: "security", nb: "Sikkerhet", en: "Security", Icon: Shield },
  { id: "climate", nb: "Klima", en: "Climate", Icon: Thermometer },
] as const;
export type HomeTab = (typeof homeTabs)[number]["id"];
// A gesture beginning on a control belongs to that control, never the pager.
const interactive =
  'button,a,input,select,textarea,summary,video,svg,dialog,[role="dialog"],[role="slider"],[role="tablist"],[contenteditable="true"],[data-no-swipe]';
export function HomeTabs({
  tab,
  change,
  lang,
  children,
}: {
  tab: HomeTab;
  change: (tab: HomeTab) => void;
  lang: string;
  children: ReactNode;
}) {
  const nav = useRef<HTMLDivElement>(null);
  const gesture = useRef<{
    id: number;
    x: number;
    y: number;
    time: number;
  } | null>(null);
  const index = homeTabs.findIndex((t) => t.id === tab);
  const previous = useRef(index);
  useEffect(() => {
    if (
      previous.current !== index &&
      nav.current &&
      nav.current.getBoundingClientRect().top < 65
    )
      nav.current.scrollIntoView({ block: "start", behavior: "instant" });
    previous.current = index;
  }, [index]);
  function select(next: number, focus = false) {
    if (next < 0 || next >= homeTabs.length || next === index) return;
    change(homeTabs[next].id);
    if (focus)
      nav.current
        ?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
        [next]?.focus();
  }
  return (
    <>
      <div
        className="home-tabs"
        ref={nav}
        role="tablist"
        aria-label={lang === "en" ? "Home views" : "Visninger i Hjem"}
      >
        {homeTabs.map(({ id, nb, en, Icon }, i) => (
          <button
            key={id}
            id={`home-tab-${id}`}
            role="tab"
            aria-selected={tab === id}
            aria-controls={`home-page-${id}`}
            tabIndex={tab === id ? 0 : -1}
            onClick={() => select(i)}
            onKeyDown={(e) => {
              const next =
                e.key === "ArrowRight"
                  ? (index + 1) % 5
                  : e.key === "ArrowLeft"
                    ? (index + 4) % 5
                    : e.key === "Home"
                      ? 0
                      : e.key === "End"
                        ? 4
                        : null;
              if (next !== null) {
                e.preventDefault();
                select(next, true);
              }
            }}
          >
            <Icon size={19} />
            <span>{lang === "en" ? en : nb}</span>
          </button>
        ))}
      </div>
      <div
        className="home-tab-panel"
        id={`home-page-${tab}`}
        role="tabpanel"
        aria-labelledby={`home-tab-${tab}`}
        tabIndex={0}
        onPointerDown={(e) => {
          gesture.current = null;
          if (
            e.pointerType !== "touch" ||
            !e.isPrimary ||
            (e.target as Element).closest(interactive)
          )
            return;
          gesture.current = {
            id: e.pointerId,
            x: e.clientX,
            y: e.clientY,
            time: Date.now(),
          };
        }}
        onPointerMove={(e) => {
          const g = gesture.current;
          if (
            g &&
            (e.pointerId !== g.id ||
              (Math.abs(e.clientY - g.y) > 14 &&
                Math.abs(e.clientY - g.y) > Math.abs(e.clientX - g.x)))
          )
            gesture.current = null;
        }}
        onPointerCancel={() => {
          gesture.current = null;
        }}
        onPointerUp={(e) => {
          const g = gesture.current;
          gesture.current = null;
          if (!g || g.id !== e.pointerId || Date.now() - g.time > 900) return;
          const dx = e.clientX - g.x,
            dy = e.clientY - g.y;
          if (Math.abs(dx) >= 70 && Math.abs(dx) > Math.abs(dy) * 2)
            select(index + (dx < 0 ? 1 : -1));
        }}
      >
        <div
          key={tab}
          className="home-tab-content"
          style={
            {
              "--home-entry": index < previous.current ? "-14px" : "14px",
            } as CSSProperties
          }
        >
          {children}
        </div>
      </div>
    </>
  );
}
