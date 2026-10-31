import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Maximize2 } from "lucide-react";
import { SettingsDialog } from "./SettingsDialog";
import type { CardConfig } from "./homeGridModel";
import { cardImageURL } from "./CardPresentation";

/** Cards never scroll internally. Unusually dense/small cards offer the full view. */
export function HomeGridContent({
  children,
  title,
  lang,
  editing,
  config,
}: {
  children: ReactNode;
  title: string;
  lang: string;
  editing: boolean;
  config?: CardConfig;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = useState(false);
  const [expanded, expand] = useState(false);

  useLayoutEffect(() => {
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
  }, [children, editing]);

  return (
    <>
      <div
        ref={viewport}
        className="home-canvas-viewport"
        data-overflow={overflow}
        data-card-image={config?.image}
      >
        {config && cardImageURL(config.image) && config.type !== "picture" && (
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
      {expanded && (
        <SettingsDialog title={title} lang={lang} onClose={() => expand(false)}>
          <div className="home-canvas-expanded">{children}</div>
        </SettingsDialog>
      )}
    </>
  );
}
