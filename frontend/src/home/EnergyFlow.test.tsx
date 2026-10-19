import { afterEach, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { EnergyFlow } from "./EnergyFlow";
import type { Home } from "../types";

const sceneLoaded = vi.hoisted(() => vi.fn());
vi.mock("./EnergyScene", () => {
  sceneLoaded();
  return { default: () => null };
});
afterEach(() => vi.unstubAllGlobals());
it("renders energy readings without even importing the 3D scene on iOS", async () => {
  vi.stubGlobal("navigator", {
    userAgent: "iPhone",
    platform: "iPhone",
    maxTouchPoints: 5,
  });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const html = renderToString(
    <QueryClientProvider client={client}>
      <EnergyFlow
        home={{ controls: [] } as unknown as Home}
        offline={true}
        lang="nb"
      />
    </QueryClientProvider>,
  );
  await Promise.resolve();
  expect(html).toContain("Energien i hjemmet ditt");
  expect(html).toContain("flow-measurements");
  expect(html).not.toContain("Bygger energihuset");
  expect(sceneLoaded).not.toHaveBeenCalled();
  client.clear();
});
