import { useEffect, useId } from "react";
import { Smartphone } from "lucide-react";
import {
  notificationActionPrefix,
  notificationRecipientLabel,
  useNotificationRecipients,
} from "./notificationRecipients";

export function NotificationRecipient({
  value,
  onChange,
  lang,
  report,
}: {
  value: string;
  onChange: (value: string) => void;
  lang: string;
  report?: (id: string, valid: boolean) => void;
}) {
  const id = useId();
  const { labels, status, isFetching, refetch } =
    useNotificationRecipients(lang);
  const t = (nb: string, en: string) => (lang === "en" ? en : nb);
  const valid = status === "ready" && labels.has(value);
  useEffect(() => {
    report?.(id, valid);
    return () => report?.(id, true);
  }, [report, id, valid]);
  return (
    <div className="routine-field">
      <label className="flow-form-field">
        <span>
          <Smartphone size={18} />{" "}
          {t("Telefon som mottar varselet", "Phone receiving the notification")}
        </span>
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={status !== "ready"}
        >
          <option value={notificationActionPrefix}>
            {notificationRecipientLabel(notificationActionPrefix, lang)}
          </option>
          {!labels.has(value) && value !== notificationActionPrefix && (
            <option value={value}>
              {status === "loading"
                ? t("Henter telefon …", "Loading phone …")
                : notificationRecipientLabel(value, lang)}
            </option>
          )}
          {[...labels].map(([action, name]) => (
            <option key={action} value={action}>
              {name}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        disabled={isFetching}
        onClick={() => void refetch()}
      >
        {t("Oppdater mottakerlisten", "Refresh phone list")}
      </button>
      {status === "loading" && (
        <small role="status">
          {t("Henter telefoner …", "Loading phones …")}
        </small>
      )}
      {status === "error" && (
        <small role="alert">
          {t(
            "Kunne ikke hente telefonene. Trykk Oppdater mottakerlisten for å prøve igjen.",
            "Could not load phones. Refresh the phone list to retry.",
          )}
        </small>
      )}
      {status === "ready" && !labels.size && (
        <small>
          {t(
            "Ingen telefoner har aktivert varsler ennå. Åpne SMARTi på telefonen og velg Innstillinger → Denne iPhonen → Varsler → Aktiver varsler.",
            "No phones have enabled notifications yet. Open SMARTi on your phone and choose Settings → This iPhone → Notifications → Enable notifications.",
          )}
        </small>
      )}
    </div>
  );
}
