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
  const close = () => {
    source?.close();
    source = undefined;
  };
  function reconnect() {
    if (stopped || retry) return;
    connected = false;
    status(false);
    close();
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
      message(event);
    };
    current.addEventListener("heartbeat", () => {
      if (source !== current) return;
      lastFrame = Date.now();
      delay = 1000;
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
    if (!connected || Date.now() - lastFrame > 45000) {
      clearTimeout(retry);
      retry = undefined;
      connect();
    }
  };
  const watchdog = setInterval(() => {
    if (Date.now() - lastFrame > 45000) reconnect();
  }, 5000);
  window.addEventListener("online", resume);
  document.addEventListener("visibilitychange", resume);
  status(false);
  connect();
  return () => {
    stopped = true;
    clearInterval(watchdog);
    clearTimeout(retry);
    close();
    window.removeEventListener("online", resume);
    document.removeEventListener("visibilitychange", resume);
  };
}
