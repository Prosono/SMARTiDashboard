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
  const en = lang === "en";
  const actions = [
    {
      command: "open",
      icon: Smartphone,
      label: en ? "This iPhone" : "Denne iPhonen",
    },
    {
      command: "inbox",
      icon: Bell,
      label: en ? "Notification centre" : "Varslingssenter",
    },
    {
      command: "remote",
      icon: UserRound,
      label: en ? "Open My page" : "Åpne Min side",
    },
  ];
  return (
    <div
      className="phone-settings-actions"
      role="group"
      aria-label={en ? "iPhone shortcuts" : "Snarveier på iPhone"}
    >
      {actions.map(({ command, icon: Icon, label }) => (
        <button
          type="button"
          key={command}
          className="phone-settings-button"
          aria-label={label}
          title={label}
          onClick={() => handler.postMessage(command)}
        >
          <Icon size={18} aria-hidden="true" />
          <span>{label}</span>
        </button>
      ))}
    </div>
  );
}
