import { afterEach, expect, it, vi } from "vitest";
import { api } from "./api";
import { openRemoteConsole } from "./remoteConsole";
vi.mock("./api", () => ({ api: vi.fn() }));
const home = "11111111-1111-4111-8111-111111111111.home.smarti.dev";
afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});
it("opens only the isolated console for this home", async () => {
  vi.stubGlobal("window", { location: { hostname: home } });
  const url = `https://ha-${home}/_smarti/launch#single-use-ticket`;
  vi.mocked(api).mockResolvedValue({ url });
  expect(await openRemoteConsole("addon_zwavejsui")).toBe(url);
  expect(api).toHaveBeenCalledWith("manage/console/open", "POST", {
    slug: "addon_zwavejsui",
  });
});
it.each([
  "https://evil.example/_smarti/launch#ticket",
  `http://ha-${home}/_smarti/launch#ticket`,
  `https://ha-${home}/other#ticket`,
  `https://ha-${home}/_smarti/launch`,
  `https://user@ha-${home}/_smarti/launch#ticket`,
])("rejects invalid console address %s", async (url) => {
  vi.stubGlobal("window", { location: { hostname: home } });
  vi.mocked(api).mockResolvedValue({ url });
  await expect(openRemoteConsole()).rejects.toThrow("Invalid console address");
});
