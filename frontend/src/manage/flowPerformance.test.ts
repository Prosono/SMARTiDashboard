import { it, expect } from "vitest";
import {
  routeWire,
  wirePath,
  smoothWirePath,
  blocked,
  type Box,
} from "./flowRouting";
it("measures routing for a 30-card editing workload", () => {
  const boxes: Box[] = Array.from({ length: 30 }, (_, i) => ({
    id: String(i),
    x: 30 + (i % 6) * 420 + ((i * 17) % 80),
    y: 40 + Math.floor(i / 6) * 260 + ((i * 23) % 70),
    width: 260,
    height: 150,
  }));
  const samples: number[] = [];
  for (let run = 0; run < 12; run++) {
    boxes[12].y = 460 + run * 10;
    const start = performance.now();
    const earlier: ReturnType<typeof routeWire>[] = [];
    for (let i = 1; i < boxes.length; i++) {
      const points = routeWire(boxes[i - 1], boxes[i], boxes);
      for (let j = 1; j < points.length; j++)
        expect(blocked(points[j - 1], points[j], boxes)).toBe(false);
      smoothWirePath(points, boxes, earlier) || wirePath(points, earlier);
      earlier.push(points);
    }
    samples.push(performance.now() - start);
  }
  samples.sort((a, b) => a - b);
  console.log(
    "ROUTING_MS",
    JSON.stringify({ median: samples[6], max: samples.at(-1) }),
  );
});
