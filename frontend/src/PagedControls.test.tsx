import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PagedControls } from "./PagedControls";
import type { Control } from "./types";

it("bounds rendered cards in a 971-control home", () => {
  const controls = Array.from({ length: 971 }, (_, i) => ({ id: String(i) }) as Control);
  const html = renderToStaticMarkup(<PagedControls controls={controls} lang="nb"
    render={rows => rows.map(c => <article key={c.id}>{c.id}</article>)} />);
  expect(html.match(/<article>/g)).toHaveLength(48);
  expect(html).toContain("1–48 av 971");
});

it("can display a search result from beyond the first page", () => {
  const html = renderToStaticMarkup(<PagedControls controls={[{ id: "970" } as Control]} lang="nb"
    render={rows => rows.map(c => <article key={c.id}>{c.id}</article>)} />);
  expect(html).toContain("<article>970</article>");
  expect(html).not.toContain("<nav");
});
