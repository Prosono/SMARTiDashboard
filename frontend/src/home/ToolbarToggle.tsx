import { ChevronDown, ChevronUp } from "lucide-react";
import { useContext, useId, useState } from "react";
import { HomeBannerless } from "./CategoryIntro";
import "./toolbarToggle.css";

export function useToolbarDisclosure() {
  const bannerless = useContext(HomeBannerless);
  const [expanded, setExpanded] = useState(false);
  const id = useId();
  return {
    expanded: bannerless || expanded,
    id,
    toggle: () => setExpanded((value) => !value),
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
