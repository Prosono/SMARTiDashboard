import { useState, type ReactNode } from "react";
import type { Control } from "./types";

// Bound mounted controls even in homes with thousands of entities. Filtering
// happens before pagination, so search still includes the entire home.
export const CONTROL_PAGE_SIZE = 48;

export function PagedControls({ controls, render, lang }: {
  controls: Control[];
  render: (controls: Control[]) => ReactNode;
  lang: string;
}) {
  const [requestedPage, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(controls.length / CONTROL_PAGE_SIZE));
  const page = Math.min(requestedPage, pages - 1);
  const start = page * CONTROL_PAGE_SIZE;
  return <>
    {pages > 1 && <nav className="control-pagination" aria-label={lang === "en" ? "Device pages" : "Enhetssider"}>
      <span role="status">{start + 1}–{Math.min(start + CONTROL_PAGE_SIZE, controls.length)} {lang === "en" ? "of" : "av"} {controls.length}</span>
      <button disabled={page === 0} onClick={() => setPage(page - 1)}>{lang === "en" ? "Previous" : "Forrige"}</button>
      <button disabled={page === pages - 1} onClick={() => setPage(page + 1)}>{lang === "en" ? "Next" : "Neste"}</button>
    </nav>}
    {render(controls.slice(start, start + CONTROL_PAGE_SIZE))}
  </>;
}
