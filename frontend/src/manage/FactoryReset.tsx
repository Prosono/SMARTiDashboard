import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { api, ApiError } from "../api";
import { SettingsDialog } from "../home/SettingsDialog";
import "./factoryReset.css";

type Job = {id: string; status: string; step: string; error: string; results: {kind: string; name: string; status: string; reason: string}[]};
type Readiness = { ready: boolean; full?: boolean; blockers: string[]; job?: Job | null };
export function FactoryReset({ lang }: { lang: string }) {
  const t = (nb: string, en: string) => lang === "en" ? en : nb;
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [loss, setLoss] = useState(false);
  const [pairing, setPairing] = useState(false);
  const [backup, setBackup] = useState("");
  const [manual, setManual] = useState(false);
  const [newAttempt, setNewAttempt] = useState(false);
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [submitted, setSubmitted] = useState<Job | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const readiness = useQuery({
    queryKey: ["factory-reset-readiness"],
    queryFn: async () => {
      try { return await api<Readiness>("manage/settings/factory-reset"); }
      catch (e) { if (submitted && e instanceof ApiError && e.status === 401) window.location.assign("https://home.smarti.dev/"); throw e; }
    },
    enabled: open,
    staleTime: 0,
    refetchInterval: open ? 2000 : false,
  });
  const job = newAttempt ? submitted : (readiness.data?.job || submitted);
  function close() { setOpen(false); setPassword(""); setConfirmation(""); setLoss(false); setPairing(false); setBackup(""); setManual(false); setError(""); }
  return <section className="factory-reset-panel">
    <div><AlertTriangle size={24} aria-hidden="true" /><h2>{t("Tilbakestill til fabrikkinnstillinger", "Factory reset")}</h2></div>
    <p>{t("Slett hjemmets oppsett, historikk og lokale brukere. Installerte apper beholdes. Du setter opp hjemmet på nytt fra Min side.", "Erase home configuration, history and local users. Installed apps are kept. Set up the home again from your account.")}</p>
    <button className="factory-reset-danger" onClick={() => setOpen(true)}><RotateCcw size={18} aria-hidden="true" />{t("Se hva som tilbakestilles", "Review factory reset")}</button>
    {open && <SettingsDialog title={t("Tilbakestill huben?", "Reset this hub?")} lang={lang} busy={busy} onClose={close} compact>
      {job ? <div className="factory-reset-form" aria-live="polite">
        <h3>{job.status === "running" ? t("Tilbakestilling pågår", "Reset in progress") : job.status === "completed" ? t("Tilbakestilling fullført", "Reset complete") : t("Tilbakestillingen er ikke fullført", "Reset is incomplete")}</h3>
        <p>{job.status === "running" ? t("Ikke koble fra strømmen. Du kan komme tilbake hit for å se fremdriften.", "Keep the hub powered on. You can return here to check progress.") : t("Se rapporten nedenfor. Hvis tilbakestillingen er avbrutt, ikke forsøk å starte HA manuelt. Gå til Min side for status og nytt oppsett, eller kontakt support.", "Review the report below. If interrupted, do not start HA manually. Open your account for status and setup, or contact support.")}</p>
        <a href="https://home.smarti.dev/" target="_blank" rel="noreferrer">{t("Åpne Min side og sett opp hjemmet på nytt", "Open your account to set up the home again")}</a>
        <p>{job.results.filter(r => r.status === "done").length} / {job.results.length} {t("trinn bekreftet", "steps confirmed")}</p>
        {job.error && <p role="alert">{t("Prosessen stoppet eller ble avbrutt. Handlinger med ukjent resultat blir ikke gjentatt automatisk.", "The process stopped or was interrupted. Uncertain operations are not automatically repeated.")}</p>}
        <ul className="factory-reset-results">{job.results.map((r,i) => <li key={i}><strong>{r.name}</strong><span>{r.status === "done" ? t("Bekreftet utført", "Confirmed") : r.status === "pending" ? t("Venter", "Waiting") : r.status === "running" ? t("Pågår", "Working") : r.status === "manual" ? t("Må følges opp manuelt", "Manual follow-up required") : t("Ikke bekreftet utført", "Not confirmed")}</span>{r.status === "manual" || r.status === "unconfirmed" ? <small>{r.reason === "zwave_exclusion_required" ? t("Fjern Z-Wave-enheten via ekskludering. Det kan kreve at du trykker på enheten.", "Remove the Z-Wave device through exclusion, which may require physical interaction.") : r.reason === "ha_owner_cleanup_required" ? t("HA tillater ikke sletting av eierkontoen gjennom dette grensesnittet.", "HA does not allow deleting its owner account through this interface.") : r.reason === "history_purge_requested" ? t("Sletting er bestilt hos HA. Fullføring må kontrolleres.", "HA received a purge request. Completion needs verification.") : r.reason === "yaml_cleanup_required" ? t("Oppsett i YAML må fjernes i HA.", "YAML configuration must be removed in HA.") : r.reason === "configuration_review_required" ? t("Kontroller integrasjoner, hjelpere, plassering, YAML-oppsett og gamle tilganger i HA. SMARTi-brukere og fjernaksess er ennå ikke nullstilt.", "Review integrations, helpers, location, YAML and existing access in HA. SMARTi users and remote access have not been reset yet.") : t("Kontroller enheten eller oppsettet i HA før du fortsetter. En fysisk nullstilling kan være nødvendig.", "Check the device or configuration in HA before continuing. A physical reset may be needed.")}</small> : null}</li>)}</ul>
        <button type="button" onClick={close}>{t("Lukk", "Close")}</button>
        {job.status !== "running" && <button type="button" onClick={() => {setNewAttempt(true);setSubmitted(null);setRequestId(crypto.randomUUID());}}>{t("Gå gjennom en ny tilbakestilling", "Review another reset")}</button>}
      </div> : <form className="factory-reset-form" onSubmit={async e => {
        e.preventDefault();
        if (!readiness.data?.ready || busy) return;
        setBusy(true); setError("");
        try {
          const result = await api<Job>("manage/settings/factory-reset", "POST", {request_id: requestId, password, confirmation, acknowledge_data_loss: loss, acknowledge_pairing: pairing, acknowledge_manual_cleanup: manual, backup_decision: backup});
          setSubmitted(result); setNewAttempt(false); void readiness.refetch();
        } catch {
          setError(t("Tilbakestillingen kunne ikke startes. Kontroller passordet og hubens status før du prøver igjen.", "The reset could not start. Check your password and hub status before retrying."));
        } finally { setPassword(""); setBusy(false); }
      }}>
        <p><strong>{t("Dette kan ikke angres.", "This cannot be undone.")}</strong> {t("Vi forsøker å fjerne enheter, rom, soner, automasjoner, scener og historikk. Det som slettes, kan ikke gjenopprettes uten sikkerhetskopi.", "We attempt to remove devices, rooms, zones, automations, scenes and history. Removed data requires a backup to restore.")}</p>
        <p>{t("Programvaren, hubens identitet og eierskapet på Min side beholdes. Dette overfører ikke huben til en ny eier.", "Software, hub identity and portal ownership are kept. This does not transfer the hub to another owner.")}</p>
        <aside className="factory-reset-warning"><AlertTriangle size={22} aria-hidden="true" /><div><strong>{t("Noen paringer kan bli igjen", "Some pairings may remain")}</strong><p>{t("Vi forsøker å fjerne enhetene fra huben. Enheter som er avslått, sover eller ikke svarer, kan fortsatt være paret. Du kan måtte tilbakestille disse fysisk etter produsentens veiledning før du kobler dem til på nytt. Du får en oversikt over det som ikke kunne bekreftes fjernet.", "We attempt to remove devices from the hub. Devices that are off, sleeping or unresponsive may remain paired. You may need to physically reset them using the manufacturer's instructions before pairing again. Anything not confirmed removed will be listed.")}</p></div></aside>
        <label>{t("Sikkerhetskopi", "Backup")}<select aria-label={t("Sikkerhetskopi", "Backup")} required value={backup} onChange={e => setBackup(e.target.value)}><option value="">{t("Velg før du fortsetter", "Choose before continuing")}</option><option value="saved">{t("Kopi lagret utenfor huben", "Backup saved outside this hub")}</option><option value="skip">{t("Fortsett uten sikkerhetskopi", "Continue without a backup")}</option></select></label>
        <p className="muted">{t("Du kan opprette og laste ned en kopi under Innstillinger → Sikkerhetskopiering før du fortsetter.", "Create and download a backup under Settings → Backups before continuing.")}</p>
        <label className="factory-reset-check"><input type="checkbox" required checked={loss} onChange={e => setLoss(e.target.checked)} />{t("Jeg forstår at hjemmets data slettes.", "I understand that home data will be erased.")}</label>
        <label className="factory-reset-check"><input type="checkbox" required checked={pairing} onChange={e => setPairing(e.target.checked)} />{t("Jeg forstår at noen enheter må nullstilles fysisk og pares på nytt.", "I understand some devices require a physical reset and pairing again.")}</label>
        <aside className="factory-reset-warning"><p>{t("HA-eier, lokale brukere, innlogginger, integrasjoner og hjemmets oppsett slettes. Du blir logget ut, og HA holdes stoppet til du starter nytt oppsett fra Mine hjem på home.smarti.dev. Kontoen din og eierskapet beholdes. Appene beholdes, men integrasjoner må kobles til på nytt.", "The HA owner, local users, sessions, integrations and home configuration are erased. You are signed out and HA stays stopped until you begin setup again from My homes at home.smarti.dev. Your portal account, ownership and installed apps are kept; integrations must be connected again.")}</p></aside>
        <label className="factory-reset-check"><input type="checkbox" required checked={manual} onChange={e => setManual(e.target.checked)} />{t("Jeg forstår at jeg må sette opp hjemmet og koble til integrasjoner på nytt, og at noen paringer kan kreve manuell opprydding.", "I accept that reset may be incomplete and require manual cleanup.")}</label>
        <label>{t("Skriv RESET HUB for å bekrefte", "Type RESET HUB to confirm")}<input value={confirmation} onChange={e => setConfirmation(e.target.value)} autoComplete="off" spellCheck={false} required pattern="RESET HUB" /></label>
        <label>{t("Passordet til din administratorkonto", "Your administrator account password")}<input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" required maxLength={128} /></label>
        {readiness.isPending ? <p role="status">{t("Kontrollerer huben…", "Checking hub…")}</p> : !readiness.data?.ready && <p role="status" className="factory-reset-unavailable">{readiness.isError ? t("Kunne ikke kontrollere huben. Lukk dialogen og prøv igjen.", "Could not check the hub. Close this dialog and retry.") : t("Tilbakestilling krever en tilkoblet hub uten aktiv paring, tilgang til HA-konfigurasjonen og oppdatert skytjeneste. Egendefinert historikkdatabase/oppsett kan kreve hjelp fra support. Ingen data er slettet.", "Reset requires a connected live hub with no active pairing. No data has been erased.")}</p>}
        {error && <p role="alert">{error}</p>}
        <div className="factory-reset-actions"><button type="button" disabled={busy} onClick={close}>{t("Avbryt", "Cancel")}</button><button className="factory-reset-danger" disabled={busy || !readiness.data?.ready || !password || confirmation !== "RESET HUB" || !loss || !pairing || !manual || !backup}>{t("Start tilbakestilling", "Start reset")}</button></div>
      </form>}
    </SettingsDialog>}
  </section>;
}
