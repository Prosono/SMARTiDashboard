import { ChevronDown, ChevronUp } from "lucide-react";
import {
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { usePageSearch } from "../PageSearch";
import { HomeBannerless } from "./CategoryIntro";
import { HomePageTools } from "./HomePageTools";
import "./toolbarToggle.css";

export function useToolbarDisclosure(pageSearchLabel?: string) {
  const tools = useContext(HomePageTools);
  const [expanded, setExpanded] = useState(false);
  const id = useId();
  const pageSearchOpener = useRef<HTMLElement>(null);
  const toggle = useCallback(() => setExpanded((value) => !value), []);
  usePageSearch(
    !tools && pageSearchLabel
      ? {
          label: pageSearchLabel,
          controls: id,
          expanded,
          open: () => {
            if (document.activeElement instanceof HTMLElement)
              pageSearchOpener.current = document.activeElement;
            toggle();
          },
        }
      : null,
  );
  useLayoutEffect(() => {
    if (!tools) return;
    tools.setSearch({ id, expanded, toggle });
    return () => tools.setSearch(null);
  }, [tools, id, expanded, toggle]);
  useEffect(() => {
    if ((!tools && !pageSearchLabel) || !expanded) return;
    const toolbar = document.getElementById(id);
    toolbar
      ?.querySelector<HTMLInputElement>(
        'input:not([type="checkbox"]):not([type="radio"])',
      )
      ?.focus({ preventScroll: true });
    const close = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      setExpanded(false);
      (tools?.searchButton.current || pageSearchOpener.current)?.focus();
    };
    toolbar?.addEventListener("keydown", close);
    return () => toolbar?.removeEventListener("keydown", close);
  }, [tools, expanded, id, pageSearchLabel]);
  return {
    expanded,
    id,
    toggle,
  };
}

export function ToolbarToggle({
  expanded,
  id,
  toggle,
  lang,
}: ReturnType<typeof useToolbarDisclosure> & { lang: string }) {
  const bannerless = useContext(HomeBannerless);
  if (bannerless) return null;
  const label =
    lang === "en"
      ? expanded
        ? "Hide search and filters"
        : "Show search and filters"
      : expanded
        ? "Skjul søk og filtre"
        : "Vis søk og filtre";
  const Icon = expanded ? ChevronUp : ChevronDown;
  return (
    <button
      className="toolbar-toggle"
      type="button"
      aria-label={label}
      title={label}
      aria-expanded={expanded}
      aria-controls={id}
      onClick={toggle}
    >
      <Icon size={20} aria-hidden="true" />
    </button>
  );
}
