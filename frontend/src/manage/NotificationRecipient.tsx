import { useEffect, useId, useState } from "react";
import { Smartphone } from "lucide-react";
import { api } from "../api";

type Recipient = { action: string; name: string };
export function NotificationRecipient({ value, onChange, lang, report }: {
  value: string; onChange: (value: string) => void; lang: string;
  report?: (id: string, valid: boolean) => void;
}) {
  const id = useId();
  const [refresh, setRefresh] = useState(0);
  const [items, setItems] = useState<Recipient[]>([]);
  const [status, setStatus] = useState("loading");
  const t = (nb: string, en: string) => lang === "en" ? en : nb;
  useEffect(() => {
    let active = true;
    setStatus("loading");
    api<Recipient[]>("/api/manage/notification-recipients").then((rows) => {
      if (active) { setItems(rows); setStatus("ready"); }
    }).catch(() => { if (active) setStatus("error"); });
    return () => { active = false; };
  }, [refresh]);
  const valid = items.some((x) => x.action === value);
  useEffect(() => { report?.(id, valid); return () => report?.(id, true); }, [report, id, valid]);
  return <div className="routine-field">
    <label className="flow-form-field"><span><Smartphone size={18} /> {t("Send varsel til", "Send notification to")}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} disabled={status !== "ready"}>
        <option value="notify.mobile_app_">{t("Velg telefon", "Choose phone")}</option>
        {!valid && value !== "notify.mobile_app_" && <option value={value}>{value} — {t("ikke tilgjengelig", "unavailable")}</option>}
        {items.map((x) => <option key={x.action} value={x.action}>{x.name}</option>)}
      </select>
    </label>
    <button type="button" disabled={status === "loading"} onClick={() => setRefresh((n) => n + 1)}>{t("Oppdater telefonlisten", "Refresh phone list")}</button>
    {status === "loading" && <small>{t("Henter telefoner …", "Loading phones …")}</small>}
    {status === "error" && <small role="alert">{t("Kunne ikke hente telefonene. Trykk Oppdater telefonlisten for å prøve igjen.", "Could not load phones. Refresh the phone list to retry.")}</small>}
    {status === "ready" && !items.length && <small>{t("Ingen telefoner har aktivert varsler ennå. Åpne SMARTi på telefonen og velg Innstillinger → Denne iPhonen → Varsler → Aktiver varsler.", "No phones have enabled notifications yet. Open SMARTi on your phone and choose Settings → This iPhone → Notifications → Enable notifications.")}</small>}
  </div>;
}
