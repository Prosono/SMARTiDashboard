import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";

type Box = { x: number; y: number; width: number; height: number };
const easing = "cubic-bezier(0.22, 1, 0.36, 1)";

/** FLIP only changed cards. Live sensor refreshes do not restart layout motion. */
export function useGridMotion(
  surface: RefObject<HTMLDivElement | null>,
  layoutKey: string,
  editing: boolean,
  active: string | null,
) {
  const previous = useRef(new Map<string, Box>());
  const animations = useRef(new Map<HTMLElement, Animation>());
  const editingBefore = useRef(false);

  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const stop = () => {
      if (motion.matches) {
        animations.current.forEach((animation) => animation.cancel());
        animations.current.clear();
      }
    };
    motion.addEventListener("change", stop);
    return () => {
      motion.removeEventListener("change", stop);
      animations.current.forEach((animation) => animation.cancel());
      animations.current.clear();
    };
  }, []);

  useLayoutEffect(() => {
    const grid = surface.current;
    if (!grid) return;
    const cells = Array.from(grid.children) as HTMLElement[];
    // Read interrupted animation progress before cancelling. Retarget from what
    // the resident currently sees, rather than jumping back to the last cell.
    const visual = new Map<string, Box>();
    for (const cell of cells) {
      const id = cell.dataset.card!;
      const before = previous.current.get(id);
      if (!before) continue;
      const matrix = new DOMMatrixReadOnly(getComputedStyle(cell).transform);
      visual.set(id, {
        x: before.x + matrix.e,
        y: before.y + matrix.f,
        width: before.width * matrix.a,
        height: before.height * matrix.d,
      });
    }
    animations.current.forEach((animation) => animation.cancel());
    animations.current.clear();
    const origin = grid.getBoundingClientRect();
    const targets = cells.map((cell) => {
      const box = cell.getBoundingClientRect();
      return {
        cell,
        id: cell.dataset.card!,
        box: {
          x: box.x - origin.x,
          y: box.y - origin.y,
          width: box.width,
          height: box.height,
        },
      };
    });
    const enabled =
      (editing || editingBefore.current) &&
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    for (const { cell, id, box } of targets) {
      const before = visual.get(id);
      let frames: Keyframe[] | null = null;
      if (enabled && before && box.width && box.height) {
        const x = before.x - box.x,
          y = before.y - box.y,
          sx = before.width / box.width,
          sy = before.height / box.height;
        if (
          Math.abs(x) > 0.5 ||
          Math.abs(y) > 0.5 ||
          Math.abs(before.width - box.width) > 0.5 ||
          Math.abs(before.height - box.height) > 0.5
        )
          frames = [
            { transform: `translate(${x}px, ${y}px) scale(${sx}, ${sy})` },
            { transform: "none" },
          ];
      } else if (enabled && !before) {
        frames = [
          { opacity: 0, transform: "translateY(8px) scale(0.98)" },
          { opacity: 1, transform: "none" },
        ];
      }
      if (frames) {
        const animation = cell.animate(frames, {
          duration: active === id ? 180 : 280,
          easing,
        });
        animations.current.set(cell, animation);
        animation.onfinish = () => {
          if (animations.current.get(cell) === animation)
            animations.current.delete(cell);
        };
      }
    }
    previous.current = new Map(targets.map(({ id, box }) => [id, box]));
    editingBefore.current = editing;
  }, [surface, layoutKey, editing, active]);
}
