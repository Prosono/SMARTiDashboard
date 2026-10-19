type Browser = Pick<Navigator, "userAgent" | "platform" | "maxTouchPoints">;

// Avoid starting Three.js/WebGL on iOS while investigating WebContent process
// crashes. Error boundaries cannot recover a terminated browser process. iPads
// requesting desktop websites identify as Macs, so include their touch signal.
export function prefersLightweightEnergyView(
  browser: Browser | undefined = typeof navigator === "undefined"
    ? undefined
    : navigator,
): boolean {
  return (
    !!browser &&
    (/iPhone|iPad|iPod/.test(browser.userAgent) ||
      (browser.platform === "MacIntel" && browser.maxTouchPoints > 1))
  );
}
