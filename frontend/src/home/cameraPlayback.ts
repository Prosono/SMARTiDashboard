import type Hls from "hls.js";
import { api, ApiError } from "../api";

export type CameraState =
  "idle" | "loading" | "playing" | "buffering" | "error" | "blocked";
export type CameraIssue = "unavailable" | "limit" | "timeout" | "unsupported";

/** One bounded recovery, one player and one relay session per visible card. */
export function cameraPlayback(
  element: HTMLVideoElement,
  id: string,
  status: (value: CameraState) => void,
  failure: (value: CameraIssue) => void,
) {
  let closed = false,
    generation = 0,
    player: Hls | undefined,
    session: string | undefined;
  let reconnects = 0,
    recoveredAt = 0,
    deadline = 0,
    blocked = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let quiet = false,
    lastTime = 0;
  const native = !!element.canPlayType("application/vnd.apple.mpegurl");
  const module = native ? null : import("hls.js");
  // Attach a rejection handler immediately while the hub opens a cold camera.
  if (module) void module.catch(() => {});
  const stopSession = async (value: string | undefined) => {
    if (value)
      await api(
        `home/camera-stream/${value}`,
        "DELETE",
        undefined,
        AbortSignal.timeout(5000),
      ).catch(() => {});
  };
  function clearMedia() {
    quiet = true;
    player?.destroy();
    player = undefined;
    element.pause();
    element.removeAttribute("src");
    element.load();
    quiet = false;
  }
  function fail(issue: CameraIssue, retryable = true) {
    if (closed || quiet || !deadline) return;
    deadline = 0;
    generation++;
    clearMedia();
    const old = session;
    session = undefined;
    // Release immediately, including when the card closes during the retry delay.
    const released = stopSession(old);
    if (retryable && reconnects++ < 1) {
      status("loading");
      timer = setTimeout(() => {
        void released.then(start);
      }, 1200);
    } else {
      failure(issue);
      status("error");
    }
  }
  function play() {
    const attempt = generation;
    void element.play().catch((error: Error) => {
      if (closed || quiet || attempt !== generation) return;
      if (error.name === "NotAllowedError") {
        blocked = true;
        status("blocked");
      } else if (error.name !== "AbortError") fail("unavailable");
    });
  }
  async function start() {
    if (closed) return;
    const current = ++generation;
    blocked = false;
    lastTime = 0;
    deadline = Date.now() + 45000;
    status("loading");
    try {
      const stream = await api<{ id: string; path: string }>(
        `home/camera/${encodeURIComponent(id)}/live`,
        "POST",
        undefined,
        AbortSignal.timeout(35000),
      );
      if (closed || current !== generation) {
        void stopSession(stream.id);
        return;
      }
      session = stream.id;
      const src = new URL(`api/${stream.path}`, document.baseURI).href;
      if (native) {
        element.src = src;
        play();
        return;
      }
      const Hls = (await module)!.default;
      if (closed || current !== generation) return;
      if (!Hls.isSupported()) {
        fail("unsupported", false);
        return;
      }
      player = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        capLevelToPlayerSize: true,
        maxLiveSyncPlaybackRate: 1.1,
        backBufferLength: 8,
        maxBufferLength: 12,
        maxMaxBufferLength: 30,
      });
      player.on(Hls.Events.ERROR, (_event, data) => {
        if (!data.fatal || closed || current !== generation) return;
        if (data.type === Hls.ErrorTypes.MEDIA_ERROR && !recoveredAt) {
          recoveredAt = Date.now();
          deadline = Date.now() + 20000;
          player?.recoverMediaError();
        } else
          fail(
            data.type === Hls.ErrorTypes.MEDIA_ERROR
              ? "unsupported"
              : "unavailable",
          );
      });
      player.on(Hls.Events.MANIFEST_PARSED, play);
      player.attachMedia(element);
      player.loadSource(src);
    } catch (error) {
      if (closed || current !== generation) return;
      const denied =
        error instanceof ApiError &&
        [401, 403, 404, 429].includes(error.status);
      fail(
        error instanceof ApiError && error.status === 429
          ? "limit"
          : "unavailable",
        !denied,
      );
    }
  }
  const playing = () => {
    if (!closed && !quiet) {
      blocked = false;
      deadline = Date.now() + 20000;
      status("playing");
    }
  };
  const waiting = () => {
    if (!closed && !quiet && !blocked) status("buffering");
  };
  const paused = () => {
    if (!closed && !quiet && element.readyState >= 2) {
      blocked = true;
      status("blocked");
    }
  };
  const error = () => {
    if (Date.now() - recoveredAt < 2000) return;
    fail(
      element.error?.code === 4 ? "unsupported" : "unavailable",
      element.error?.code !== 4,
    );
  };
  element.addEventListener("playing", playing);
  element.addEventListener("waiting", waiting);
  element.addEventListener("stalled", waiting);
  element.addEventListener("pause", paused);
  element.addEventListener("error", error);
  element.addEventListener("ended", error);
  const watchdog = setInterval(() => {
    if (closed || blocked || !deadline) return;
    if (Math.abs(element.currentTime - lastTime) > 0.05) {
      lastTime = element.currentTime;
      deadline = Date.now() + 20000;
    }
    if (Date.now() > deadline) fail("timeout");
  }, 2000);
  void start();
  return () => {
    closed = true;
    generation++;
    clearTimeout(timer);
    clearInterval(watchdog);
    element.removeEventListener("playing", playing);
    element.removeEventListener("waiting", waiting);
    element.removeEventListener("stalled", waiting);
    element.removeEventListener("pause", paused);
    element.removeEventListener("error", error);
    element.removeEventListener("ended", error);
    clearMedia();
    void stopSession(session);
    session = undefined;
  };
}
