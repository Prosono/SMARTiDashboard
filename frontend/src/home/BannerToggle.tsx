import { ChevronDown, ChevronUp } from "lucide-react";
import { useId, useState } from "react";
import "./bannerToggle.css";

export function useBannerDisclosure() {
  const [expanded, setExpanded] = useState(false);
  const id = useId();
  return { expanded, id, toggle: () => setExpanded((value) => !value) };
}

export function BannerToggle({
  expanded,
  id,
  toggle,
  lang,
}: ReturnType<typeof useBannerDisclosure> & { lang: string }) {
  const label =
    lang === "en"
      ? expanded
        ? "Collapse banner"
        : "Expand banner"
      : expanded
        ? "Skjul banner"
        : "Utvid banner";
  const Icon = expanded ? ChevronUp : ChevronDown;
  return (
    <button
      className="banner-toggle"
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
