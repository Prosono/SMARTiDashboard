import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { SettingsDialog, InSettingsDialog } from "../home/SettingsDialog";
export function FlowStepPanel({
  title,
  lang,
  onClose,
  children,
  docked,
}: {
  title: string;
  lang: string;
  onClose: () => void;
  children: ReactNode;
  docked: boolean;
}) {
  const [desktop, setDesktop] = useState(
    () => window.matchMedia("(min-width:1200px)").matches,
  );
  const ref = useRef<HTMLDialogElement>(null),
    heading = useId();
  useEffect(() => {
    const m = window.matchMedia("(min-width:1200px)");
    const update = () => setDesktop(m.matches);
    m.addEventListener("change", update);
    return () => m.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (!docked || !desktop) return;
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    return () => {
      if (previous?.isConnected) previous.focus();
    };
  }, [docked, desktop]);
  if (!docked || !desktop)
    return (
      <SettingsDialog title={title} lang={lang} onClose={onClose}>
        {children}
      </SettingsDialog>
    );
  return (
    <dialog
      open
      ref={ref}
      tabIndex={-1}
      aria-labelledby={heading}
      className="dashboard-settings-dialog flow-step-panel"
      onKeyDown={(e) => {
        if (
          e.key === "Escape" &&
          (e.target as HTMLElement).closest("dialog") === e.currentTarget
        ) {
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <header className="dashboard-settings-heading">
        <div>
          <span>SMARTi</span>
          <h2 id={heading}>{title}</h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={lang === "en" ? "Close settings" : "Lukk innstillinger"}
        >
          <X size={20} />
        </button>
      </header>
      <div className="dashboard-settings-content">
        <InSettingsDialog.Provider value={true}>
          {children}
        </InSettingsDialog.Provider>
      </div>
    </dialog>
  );
}
