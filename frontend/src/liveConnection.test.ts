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
