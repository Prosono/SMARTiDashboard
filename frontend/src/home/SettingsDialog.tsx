import { useId, useLayoutEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import "./settingsDialog.css";

/** Native top-layer dialog keeps focus inside and returns it to the opener. */
export function SettingsDialog({
  title,
  lang,
  busy = false,
  compact = false,
  onClose,
  children,
}: {
  title: string;
  lang: string;
  busy?: boolean;
  compact?: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const heading = useId();
  useLayoutEffect(() => {
    const dialog = ref.current!;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.showModal();
    return () => {
      dialog.close();
      document.body.style.overflow = overflow;
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="dashboard-settings-dialog"
      data-compact={compact || undefined}
      aria-labelledby={heading}
      aria-busy={busy}
      tabIndex={-1}
      onKeyDown={(event) => {
        if (
          (event.target as HTMLElement).closest("dialog") !==
          event.currentTarget
        )
          return;
        if (event.key !== "Tab") return;
        const dialog = event.currentTarget;
        const targets = Array.from(
          dialog.querySelectorAll<HTMLElement>(
            "button, input, select, textarea, a[href], summary, [tabindex]",
          ),
        ).filter(
          (element) =>
            element.tabIndex >= 0 &&
            !element.matches(":disabled") &&
            element.getClientRects().length > 0,
        );
        const first = targets[0],
          last = targets[targets.length - 1];
        if (!first) {
          event.preventDefault();
          dialog.focus();
        } else if (
          event.shiftKey &&
          (document.activeElement === first ||
            document.activeElement === dialog)
        ) {
          event.preventDefault();
          last.focus();
        } else if (
          !event.shiftKey &&
          (document.activeElement === last || document.activeElement === dialog)
        ) {
          event.preventDefault();
          first.focus();
        }
      }}
      onCancel={(event) => {
        if (event.target !== event.currentTarget) return;
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <header className="dashboard-settings-heading">
        <div>
          <span>SMARTi</span>
          <h2 id={heading}>{title}</h2>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={onClose}
          aria-label={lang === "en" ? "Close settings" : "Lukk innstillinger"}
        >
          <X size={21} aria-hidden="true" />
        </button>
      </header>
      <div className="dashboard-settings-content">{children}</div>
    </dialog>
  );
}
