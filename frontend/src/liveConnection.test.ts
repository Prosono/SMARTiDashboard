import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { liveConnection } from "./liveConnection";
class Stream extends EventTarget {
  static instances: Stream[] = [];
  onopen?: () => void;
  onerror?: () => void;
  onmessage?: (e: MessageEvent) => void;
  close = vi.fn();
  constructor() {
    super();
    Stream.instances.push(this);
  }
}
let stop: () => void;
beforeEach(() => {
  vi.useFakeTimers();
  Stream.instances = [];
  vi.stubGlobal("EventSource", Stream);
  vi.stubGlobal("window", new EventTarget());
  vi.stubGlobal(
    "document",
    Object.assign(new EventTarget(), {
      baseURI: "https://example.test/ingress/",
      visibilityState: "visible",
    }),
  );
});
afterEach(() => {
  stop?.();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
it("reopens a failed stream and refreshes even without new revisions", () => {
  const status = vi.fn(),
    refresh = vi.fn();
  stop = liveConnection(status, vi.fn(), refresh, vi.fn());
  Stream.instances[0].onopen?.();
  Stream.instances[0].onerror?.();
  expect(status).toHaveBeenLastCalledWith(false);
  expect(Stream.instances[0].close).toHaveBeenCalled();
  vi.advanceTimersByTime(1000);
  Stream.instances[1].onopen?.();
  expect(refresh).toHaveBeenCalledTimes(2);
  expect(status).toHaveBeenLastCalledWith(true);
});
it("replaces silently stalled streams but keeps streams with heartbeats", () => {
  stop = liveConnection(vi.fn(), vi.fn(), vi.fn(), vi.fn());
  Stream.instances[0].onopen?.();
  for (let i = 0; i < 12; i++) {
    vi.advanceTimersByTime(10000);
    Stream.instances[0].dispatchEvent(new Event("heartbeat"));
  }
  expect(Stream.instances).toHaveLength(1);
  vi.advanceTimersByTime(51000);
  expect(Stream.instances).toHaveLength(2);
});
it("recovers immediately on network return and cleans up retries", () => {
  stop = liveConnection(vi.fn(), vi.fn(), vi.fn(), vi.fn());
  Stream.instances[0].onerror?.();
  window.dispatchEvent(new Event("online"));
  expect(Stream.instances).toHaveLength(2);
  stop();
  vi.advanceTimersByTime(120000);
  window.dispatchEvent(new Event("online"));
  expect(Stream.instances).toHaveLength(2);
});
it("handles expired authentication without reconnecting", () => {
  const expired = vi.fn();
  stop = liveConnection(vi.fn(), vi.fn(), vi.fn(), expired);
  Stream.instances[0].dispatchEvent(new Event("expired"));
  vi.advanceTimersByTime(120000);
  expect(expired).toHaveBeenCalledOnce();
  expect(Stream.instances).toHaveLength(1);
});

async function failStreams() {
  Stream.instances[0].onerror?.();
  await vi.advanceTimersByTimeAsync(1000);
  Stream.instances[1].onerror?.();
  await vi.advanceTimersByTimeAsync(2000);
  Stream.instances[2].onerror?.();
  await vi.advanceTimersByTimeAsync(0);
}
it("falls back to authenticated short polling after repeated stream failures", async () => {
  const fetcher = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ revision: 5, radio_revision: 2 }) });
  vi.stubGlobal("fetch", fetcher);
  const status = vi.fn(), message = vi.fn();
  stop = liveConnection(status, message, vi.fn(), vi.fn());
  await failStreams();
  expect(fetcher.mock.calls[0][0].href).toBe("https://example.test/ingress/api/events?poll=true");
  expect(fetcher.mock.calls[0][1].credentials).toBe("same-origin");
  expect(status).toHaveBeenLastCalledWith(true);
  expect(JSON.parse(message.mock.calls[0][0].data)).toEqual({ revision: 5, radio_revision: 2 });
  await vi.advanceTimersByTimeAsync(5000);
  expect(fetcher).toHaveBeenCalledTimes(2);
  stop();
  await vi.advanceTimersByTimeAsync(60000);
  expect(fetcher).toHaveBeenCalledTimes(2);
});
it("expires polling authentication and does not retry", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ status: 401 }));
  const expired = vi.fn();
  stop = liveConnection(vi.fn(), vi.fn(), vi.fn(), expired);
  await failStreams();
  await vi.advanceTimersByTimeAsync(60000);
  expect(expired).toHaveBeenCalledOnce();
  expect(fetch).toHaveBeenCalledOnce();
});
it("does not mark failed polling as connected and recovers on the next poll", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue({ ok: true, status: 200, json: async () => ({ revision: 1, radio_revision: 1 }) }));
  const status = vi.fn();
  stop = liveConnection(status, vi.fn(), vi.fn(), vi.fn());
  await failStreams();
  expect(status).toHaveBeenLastCalledWith(false);
  await vi.advanceTimersByTimeAsync(5000);
  expect(status).toHaveBeenLastCalledWith(true);
});
