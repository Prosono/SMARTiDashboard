import { api } from "./api";

export function remoteHome() {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.home\.smarti\.dev$/.test(
    window.location.hostname,
  );
}
export async function openRemoteConsole(slug?: string) {
  const result = await api<{ url: string }>(
    "manage/console/open",
    "POST",
    slug ? { slug } : {},
  );
  const url = new URL(result.url);
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
