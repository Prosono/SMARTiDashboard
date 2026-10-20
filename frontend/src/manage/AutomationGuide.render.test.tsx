import { expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AutomationGuide } from "./AutomationGuide";
import type { Home } from "../types";

it("opens a brand new automation with no trigger or action without crashing", () => {
  const config = { alias: "", description: "", triggers: [], conditions: [], actions: [], mode: "single" };
  const markup = renderToStaticMarkup(<AutomationGuide config={config} home={{ controls: [] } as unknown as Home} lang="nb" patch={vi.fn()} onReady={vi.fn()} onAdvanced={vi.fn()} />);
  expect(markup).toContain("Når skal det skje?");
  expect(markup).toContain("På et tidspunkt");
});
