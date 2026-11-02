import {
  useLayoutEffect,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type CSSProperties,
} from "react";
import { Maximize2 } from "lucide-react";
import { SettingsDialog } from "./SettingsDialog";
import type { CardConfig } from "./homeGridModel";
import { cardImageURL } from "./CardPresentation";
import type { CardTone } from "./cardToneModel";
import { MobileCardTile, type MobileCardProps } from "./MobileCardTile";

/** Cards never scroll internally. Unusually dense/small cards offer the full view. */
export function HomeGridContent({
  children,
  title,
  lang,
  editing,
  config,
  tone,
  lightStyle,
  mobile,
}: {
  children: ReactNode;
  title: string;
  lang: string;
  editing: boolean;
  config?: CardConfig;
  tone: CardTone;
  lightStyle?: CSSProperties;
  mobile?: MobileCardProps;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = useState(false);
  const [expanded, expand] = useState(false);

  useLayoutEffect(() => {
    if (mobile) return;
    const frame = viewport.current!,
      node = content.current!;
    let request: number | null = null;
    const measure = () => {
      if (request !== null) cancelAnimationFrame(request);
      request = requestAnimationFrame(() => {
        // The footer overlays only an overflowing preview, never changes its
        // measured height and cannot create a resize/measurement feedback loop.
        setOverflow(
          node.scrollHeight > frame.clientHeight + 2 ||
            node.scrollWidth > frame.clientWidth + 2,
        );
        request = null;
      });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(frame);
    Array.from(node.children).forEach((child) => observer.observe(child));
    node.addEventListener("load", measure, true);
    measure();
    return () => {
      observer.disconnect();
      node.removeEventListener("load", measure, true);
      if (request !== null) cancelAnimationFrame(request);
    };
  }, [children, editing, !!mobile]);
  useEffect(() => expand(false), [!!mobile]);

  return (
    <>
      {mobile ? (
        <MobileCardTile {...mobile} onOpen={() => expand(true)} />
      ) : (
        <div
          ref={viewport}
          className="home-canvas-viewport"
          data-overflow={overflow}
          data-card-image={config?.image}
        >
          {config &&
            cardImageURL(config.image) &&
            config.type !== "picture" && (
              <img
                className="personal-card-backdrop"
                src={cardImageURL(config.image)}
                alt=""
              />
            )}
          <div
            ref={content}
            className="home-canvas-content"
            {...(editing || expanded || overflow ? { inert: true } : {})}
          >
            {children}
          </div>
          {overflow && !editing && (
            <button
              className="home-canvas-expand"
              aria-label={`${lang === "en" ? "Show full card" : "Vis hele kortet"}: ${title}`}
              onClick={() => expand(true)}
            >
              <span>
                <Maximize2 size={15} aria-hidden="true" />
                {lang === "en" ? "Show full card" : "Vis hele kortet"}
              </span>
            </button>
          )}
        </div>
      )}
      {expanded && (
        <SettingsDialog title={title} lang={lang} onClose={() => expand(false)}>
          <div
            className="home-canvas-expanded"
            data-card-tone={tone}
            data-mobile-dialog={!!mobile || undefined}
            style={lightStyle}
          >
            {children}
          </div>
        </SettingsDialog>
      )}
    </>
  );
}
