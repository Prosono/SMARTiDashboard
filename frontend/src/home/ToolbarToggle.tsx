import { ChevronDown, ChevronUp } from "lucide-react";
import { useId, useState } from "react";
import "./toolbarToggle.css";

export function useToolbarDisclosure() {
  const [expanded, setExpanded] = useState(false);
  const id = useId();
  return { expanded, id, toggle: () => setExpanded((value) => !value) };
}

export function ToolbarToggle({
  expanded,
  id,
  toggle,
  lang,
}: ReturnType<typeof useToolbarDisclosure> & { lang: string }) {
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
