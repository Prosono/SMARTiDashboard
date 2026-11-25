import { api } from "./api";

export function remoteHome(hostname = window.location.hostname) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.home\.smarti\.dev$/.test(
    hostname,
  );
}
export async function openRemoteConsole(slug?: string) {
  const result = await api<{ url: string }>(
    "manage/console/open",
    "POST",
    slug ? { slug } : {},
  );
  return consoleAddress(result.url);
}

export function consoleAddress(address: string) {
  const url = new URL(address);
  if (
    !remoteHome() ||
    url.origin !== `https://ha-${window.location.hostname}` ||
    url.pathname !== "/_smarti/launch" ||
    !url.hash ||
    url.search ||
    url.username ||
    url.password
  ) {
    throw new Error("Invalid console address");
  }
  return url.href;
}
