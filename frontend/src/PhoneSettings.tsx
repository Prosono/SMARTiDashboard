import { Smartphone } from "lucide-react";

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
    <button
      className="phone-settings-button"
      onClick={() => handler.postMessage("open")}
    >
      <Smartphone size={20} aria-hidden="true" />
      {lang === "en" ? "This iPhone" : "Denne iPhonen"}
    </button>
  );
}
