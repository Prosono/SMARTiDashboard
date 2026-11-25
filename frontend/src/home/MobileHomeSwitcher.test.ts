import { expect, it } from "vitest";
import { homeSwitcherURL } from "./MobileHomeSwitcher";

const installation = "42d24b21-6ffa-442c-a6ae-6b123cf58925";
const hostedHome = {
  hostname: `${installation}.home.smarti.dev`,
  protocol: "https:",
  port: "",
};

it("opens the portal picker for the current hosted home", () => {
  expect(homeSwitcherURL(hostedHome, "en", "dark")).toBe(
    `https://home.smarti.dev/home-switcher?current=${installation}&lang=en&theme=dark`,
  );
  expect(homeSwitcherURL(hostedHome, "nb", "light")).toBe(
    `https://home.smarti.dev/home-switcher?current=${installation}&lang=nb&theme=light`,
  );
});

it.each([
  { hostname: "homeassistant.local" },
  { hostname: "192.168.1.6" },
  { hostname: "home.smarti.dev" },
  { hostname: `another.${hostedHome.hostname}` },
  { hostname: `${hostedHome.hostname}.example.com` },
  { protocol: "http:" },
  { port: "8123" },
])(
  "uses the local fallback for unsupported dashboard origins %j",
  (overrides) => {
    expect(
      homeSwitcherURL({ ...hostedHome, ...overrides }, "nb", "light"),
    ).toBeNull();
  },
);
