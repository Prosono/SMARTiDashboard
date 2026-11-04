import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { api, ApiError } from "../api";
import { cameraPlayback } from "./cameraPlayback";

vi.mock("../api", async (original) => ({
  ...(await original<typeof import("../api")>()),
  api: vi.fn(),
}));
class Video extends EventTarget {
  currentTime = 0;
  readyState = 0;
  src = "";
  error: { code: number } | null = null;
  canPlayType = () => "probably";
  play = vi.fn(async () => {});
  pause = vi.fn();
  load = vi.fn();
  removeAttribute = vi.fn(() => {
    this.src = "";
  });
}
let stop: (() => void) | undefined;
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("document", { baseURI: "https://example.test/ingress/" });
  vi.mocked(api).mockReset();
  vi.mocked(api).mockImplementation(async (_path, method) =>
    method === "POST"
      ? { id: "relay", path: "home/camera-stream/relay/playlist" }
      : { stopped: true },
  );
});
afterEach(() => {
  stop?.();
  stop = undefined;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
const video = () => new Video() as unknown as HTMLVideoElement;

it("recovers once from a transient startup failure and releases the relay on close", async () => {
  vi.mocked(api).mockRejectedValueOnce(new ApiError(503));
  const element = video(),
    status = vi.fn(),
    failure = vi.fn();
  stop = cameraPlayback(element, "camera.front", status, failure);
  await vi.advanceTimersByTimeAsync(1300);
  expect(element.src).toContain(
    "/ingress/api/home/camera-stream/relay/playlist",
  );
  element.dispatchEvent(new Event("playing"));
  expect(status).toHaveBeenLastCalledWith("playing");
  expect(failure).not.toHaveBeenCalled();
  stop();
  stop = undefined;
  expect(api).toHaveBeenCalledWith(
    "home/camera-stream/relay",
    "DELETE",
    undefined,
    expect.any(AbortSignal),
  );
});

it("does not loop when access is denied or the simultaneous-stream limit is reached", async () => {
  vi.mocked(api).mockRejectedValueOnce(new ApiError(429));
  const status = vi.fn(),
    failure = vi.fn();
  stop = cameraPlayback(video(), "camera.front", status, failure);
  await vi.advanceTimersByTimeAsync(100000);
  expect(api).toHaveBeenCalledTimes(1);
  expect(failure).toHaveBeenCalledWith("limit");
  expect(status).toHaveBeenLastCalledWith("error");
});

it("releases a broken stream even if the card closes during the recovery delay", async () => {
  const element = video();
  stop = cameraPlayback(element, "camera.front", vi.fn(), vi.fn());
  await vi.advanceTimersByTimeAsync(1);
  element.dispatchEvent(new Event("error"));
  stop();
  stop = undefined;
  await vi.advanceTimersByTimeAsync(2000);
  expect(
    vi.mocked(api).mock.calls.filter(([, method]) => method === "POST"),
  ).toHaveLength(1);
  expect(api).toHaveBeenCalledWith(
    "home/camera-stream/relay",
    "DELETE",
    undefined,
    expect.any(AbortSignal),
  );
});

it("stops indefinite loading after one bounded recovery", async () => {
  const status = vi.fn(),
    failure = vi.fn();
  stop = cameraPlayback(video(), "camera.front", status, failure);
  await vi.advanceTimersByTimeAsync(100000);
  expect(
    vi.mocked(api).mock.calls.filter(([, method]) => method === "POST"),
  ).toHaveLength(2);
  expect(failure).toHaveBeenCalledWith("timeout");
  expect(status).toHaveBeenLastCalledWith("error");
});

it("releases a late startup result after the card has already been dismissed", async () => {
  let complete!: (value: any) => void;
  vi.mocked(api).mockReturnValueOnce(
    new Promise((resolve) => {
      complete = resolve;
    }),
  );
  const element = video();
  stop = cameraPlayback(element, "camera.front", vi.fn(), vi.fn());
  stop();
  stop = undefined;
  complete({ id: "late", path: "home/camera-stream/late/playlist" });
  await vi.advanceTimersByTimeAsync(1);
  expect(element.src).toBe("");
  expect(api).toHaveBeenCalledWith(
    "home/camera-stream/late",
    "DELETE",
    undefined,
    expect.any(AbortSignal),
  );
});
