import { useEffect, type RefObject } from "react";

/** Only cards on screen wiggle. No JS animation loop or effect on FLIP geometry. */
export function useGridWiggle(
  surface: RefObject<HTMLDivElement | null>,
  editing: boolean,
) {
  useEffect(() => {
    const grid = surface.current;
    if (!grid || !editing) return;
    const observed = new Set<Element>();
    const visibility = () => {
      grid.dataset.motionVisible = String(!document.hidden);
    };
    const intersection = new IntersectionObserver(
      (entries) => {
        for (const entry of entries)
          (entry.target as HTMLElement).dataset.wiggleVisible = String(
            entry.isIntersecting,
          );
      },
      { rootMargin: "60px" },
    );
    const sync = () => {
      const cells = new Set(
        Array.from(grid.querySelectorAll(":scope > .home-canvas-cell")),
      );
      for (const cell of observed)
        if (!cells.has(cell)) {
          intersection.unobserve(cell);
          observed.delete(cell);
        }
      for (const cell of cells)
        if (!observed.has(cell)) {
          intersection.observe(cell);
          observed.add(cell);
        }
    };
    const observer = new MutationObserver(sync);
    observer.observe(grid, { childList: true });
    sync();
    visibility();
    document.addEventListener("visibilitychange", visibility);
    return () => {
      intersection.disconnect();
      observer.disconnect();
      document.removeEventListener("visibilitychange", visibility);
      delete grid.dataset.motionVisible;
      for (const cell of observed)
        delete (cell as HTMLElement).dataset.wiggleVisible;
    };
  }, [surface, editing]);
}
