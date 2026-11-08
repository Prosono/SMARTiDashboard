import { it, expect } from "vitest";
import { createWireRouter, type Box } from "./flowRouting";

it.each([30, 100])(
  "measures routing for a %i-card editing workload",
  (count) => {
    let boxes: Box[] = Array.from({ length: count }, (_, i) => ({
      id: String(i),
      x: 30 + (i % 6) * 420 + ((i * 17) % 80),
      y: 40 + Math.floor(i / 6) * 260 + ((i * 23) % 70),
      width: 260,
      height: 150,
    }));
    const edges = boxes
      .slice(1)
      .map((b, i) => ({ from: boxes[i].id, to: b.id }));
    const route = createWireRouter();
    const cold = performance.now();
    let previous = route(boxes, edges);
    const coldMs = performance.now() - cold;
    const samples: number[] = [];
    let reused = 0;
    for (let run = 0; run < 12; run++) {
      boxes = boxes.map((b, i) => (i === 12 ? { ...b, y: 460 + run * 10 } : b));
      const start = performance.now();
      const current = route(boxes, edges);
      samples.push(performance.now() - start);
      reused += current.filter((r, i) => r === previous[i]).length;
      expect(current.every((r) => r.path && !r.path.includes("NaN"))).toBe(
        true,
      );
      previous = current;
    }
    samples.sort((a, b) => a - b);
    console.log(
      "ROUTING_MS",
      JSON.stringify({
        count,
        coldMs,
        median: samples[6],
        max: samples.at(-1),
        reused,
      }),
    );
    // Coarse regression budget, not a device-specific FPS promise. Cache reuse is
    // the deterministic invariant; timings are also recorded for before/after QA.
    expect(reused).toBeGreaterThan((count - 1) * 12 * 0.5);
    expect(samples[6]).toBeLessThan(50);
  },
);
