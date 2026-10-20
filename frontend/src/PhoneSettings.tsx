import { Bell, UserRound, Smartphone } from "lucide-react";

type NativeWindow = Window & {
  webkit?: {
    messageHandlers?: {
      smartiPhoneSettings?: { postMessage: (message: string) => void };
    };
  };
};
export function PhoneSettings({ lang }: { lang: string }) {
  const handler = (window as NativeWindow).webkit?.messageHandlers
    ?.smartiPhoneSettings;
  if (!handler) return null;
  return (
    <div className="phone-settings-actions">
    <button
      className="phone-settings-button"
      onClick={() => handler.postMessage("open")}
    >
      <Smartphone size={20} aria-hidden="true" />
      {lang === "en" ? "This iPhone" : "Denne iPhonen"}
    </button>
    <button className="phone-settings-button" onClick={() => handler.postMessage("inbox")}>
      <Bell size={20} aria-hidden="true" />
      {lang === "en" ? "Notification centre" : "Varslingssenter"}
    </button>
    <button className="phone-settings-button" onClick={() => handler.postMessage("remote")}>
      <UserRound size={20} aria-hidden="true" />
      {lang === "en" ? "Open My page" : "Åpne Min side"}
    </button>
    </div>
  );
}
