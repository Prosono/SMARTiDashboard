import type { ReactNode } from "react";
import "./startupScreen.css";

/** One quiet animation, shared by access verification, session and home loading. */
export function StartupScreen({
  message,
  busy = true,
  children,
}: {
  message: string;
  busy?: boolean;
  children?: ReactNode;
}) {
  return (
    <main
      className="startup-screen"
      role="status"
      aria-live="polite"
      aria-busy={busy}
    >
      <div className="startup-symbol" aria-hidden="true">
        <img
          src={new URL("brand/smarti-logo.png", document.baseURI).href}
          alt=""
          width="40"
          height="44"
        />
        {busy && <span className="startup-spinner" />}
      </div>
      <p>{message}</p>
      {children && <div className="startup-actions">{children}</div>}
    </main>
  );
}
