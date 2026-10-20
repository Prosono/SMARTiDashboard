// Own reconnection explicitly: ingress/proxies can leave EventSource silently stalled.
export function liveConnection(
  status: (connected: boolean) => void,
  message: (event: MessageEvent) => void,
  refresh: () => void,
  expired: () => void,
) {
  let source: EventSource | undefined;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  let lastFrame = Date.now();
  let delay = 1000;
  let connected = false;
  let failures = 0;
  let polling = false;
  let pending: AbortController | undefined;
  async function poll() {
    if (stopped || pending) return;
    const controller = new AbortController();
    pending = controller;
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(new URL("api/events?poll=true", document.baseURI), {
        credentials: "same-origin", cache: "no-store", signal: controller.signal,
      });
      if (stopped) return;
      if (response.status === 401) {
        stopped = true;
        status(false);
        expired();
        return;
      }
      if (!response.ok) throw new Error("Polling unavailable");
      const data = await response.json();
      if (typeof data.revision !== "number" || typeof data.radio_revision !== "number")
        throw new Error("Invalid revision response");
      if (stopped) return;
      if (!connected) refresh();
      connected = true;
      lastFrame = Date.now();
      status(true);
      message(new MessageEvent("message", { data: JSON.stringify(data) }));
    } catch {
      if (!stopped) { connected = false; status(false); }
    } finally {
      clearTimeout(timeout);
      pending = undefined;
      if (!stopped) retry = setTimeout(() => { retry = undefined; void poll(); }, 5000);
    }
  }
  const close = () => {
    source?.close();
    source = undefined;
  };
  function reconnect() {
    if (stopped || retry) return;
    connected = false;
    status(false);
    close();
    failures += 1;
    if (failures >= 3) {
      polling = true;
      void poll();
      return;
    }
    retry = setTimeout(() => {
      retry = undefined;
      connect();
    }, delay);
    delay = Math.min(delay * 2, 30000);
  }
  function connect() {
    if (stopped) return;
    close();
    lastFrame = Date.now();
    const current = new EventSource(new URL("api/events", document.baseURI));
    source = current;
    current.onopen = () => {
      if (source !== current) return;
      lastFrame = Date.now();
      connected = true;
      status(true);
      refresh(); // Revisions may be unchanged after an interrupted/failed fetch.
    };
    current.onmessage = (event) => {
      if (source !== current) return;
      lastFrame = Date.now();
      delay = 1000;
      failures = 0;
      message(event);
    };
    current.addEventListener("heartbeat", () => {
      if (source !== current) return;
      lastFrame = Date.now();
      delay = 1000;
      failures = 0;
    });
    current.onerror = () => {
      if (source === current) reconnect();
    };
    current.addEventListener("expired", () => {
      if (source !== current) return;
      stopped = true;
      close();
      status(false);
      expired();
    });
  }
  const resume = () => {
    if (stopped || document.visibilityState === "hidden") return;
    refresh();
    if (polling) {
      clearTimeout(retry);
      retry = undefined;
      void poll();
      return;
    }
    if (!connected || Date.now() - lastFrame > 45000) {
      clearTimeout(retry);
      retry = undefined;
      connect();
    }
  };
  const watchdog = setInterval(() => {
    if (!polling && Date.now() - lastFrame > 45000) reconnect();
  }, 5000);
  window.addEventListener("online", resume);
  document.addEventListener("visibilitychange", resume);
  status(false);
  connect();
  return () => {
    stopped = true;
    pending?.abort();
    clearInterval(watchdog);
    clearTimeout(retry);
    close();
    window.removeEventListener("online", resume);
    document.removeEventListener("visibilitychange", resume);
  };
}
