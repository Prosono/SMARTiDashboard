import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, RotateCcw, House, Check } from "lucide-react";
import { api, ApiError } from "../api";
import { SettingsDialog } from "../home/SettingsDialog";
import "./factoryReset.css";

type Job = {id: string; status: string; step: string; error: string; results: {kind: string; name: string; status: string; reason: string}[]};
type Readiness = { ready: boolean; full?: boolean; blockers: string[]; job?: Job | null };
export function FactoryReset({ lang }: { lang: string }) {
  const t = (nb: string, en: string) => lang === "en" ? en : nb;
  const blockers: Record<string, string> = {
    reset_app_boot_unavailable: t("SMARTi kunne ikke bekrefte automatisk oppstart etter omstart av huben.", "SMARTi could not confirm automatic startup after reboot."),
    live_hub_required: t("SMARTi må ha kontakt med Home Assistant. Vent til tilkoblingen er tilbake.", "SMARTi must be connected to Home Assistant."),
    pairing_active: t("En paring pågår. Avslutt paringen før tilbakestilling.", "Stop active pairing before reset."),
    full_reset_requires_managed_hub: t("Huben mangler tilkoblingsidentitet eller tilgang til HA-konfigurasjonen. Kontroller at SMARTi er oppdatert og koblet til Min side.", "The hub needs its connection identity and HA configuration mount."),
    ha_config_mount_required: t("SMARTi mangler skrivetilgang til HA-konfigurasjonen. Oppdater og start SMARTi-appen på nytt i HA.", "Update and restart SMARTi to enable its HA configuration mount."),
    reset_storage_unreadable: t("SMARTi kunne ikke lese HA-oppsettet. Kontroller konfigurasjonstilgangen etter oppdateringen.", "SMARTi could not read HA configuration storage."),
    ha_auth_storage_missing: t("HAs brukerfiler er ikke tilgjengelige. Førstegangsoppsett i HA må være fullført.", "HA authentication files are missing. Complete HA onboarding first."),
    ha_auth_schema_unsupported: t("Denne versjonen av HAs brukerfiler er ikke støttet av tilbakestillingen ennå. Kontakt support.", "This HA authentication storage format needs support review."),
    ha_system_password_account_unsupported: t("En systemkonto har et uventet passordoppsett. Kontakt support før tilbakestilling.", "A system account has an unsupported password configuration."),
    invalid_ha_yaml: t("HA-konfigurasjonen kunne ikke leses som gyldig YAML. Kontakt support.", "HA configuration could not be parsed."),
    custom_yaml_requires_review: t("HA bruker ekstra konfigurasjonsfiler som må gjennomgås før sletting. Kontakt support.", "Custom HA configuration includes need review."),
    custom_recorder_or_packages_requires_review: t("HA har et eget historikk- eller pakkeoppsett som må gjennomgås før sletting. Kontakt support.", "Custom recorder or packages configuration needs review."),
    ha_storage_symlink: t("HA-oppsettet har filkoblinger som krever manuell gjennomgang. Kontakt support.", "HA storage links need manual review."),
    standard_ha_http_required: t("HAs nettverksoppsett avviker fra det tilbakestillingen støtter. Kontakt support.", "HA networking differs from the supported reset configuration."),
    reset_recovery_required: t("En tidligere tilbakestilling må fullføres eller kontrolleres av support før en ny kan startes.", "A previous reset needs recovery before another can start."),
    reset_supervisor_unavailable: t("SMARTi fikk ikke tilgang til HA Supervisor. Kontroller at appen er startet i HA.", "SMARTi could not access HA Supervisor."),
    reset_cloud_unavailable: t("SMARTi kunne ikke bekrefte resetstøtte hos skytjenesten. Kontroller internett og at huben er koblet til kontoen din.", "Cloud reset support could not be confirmed. Check connectivity and account linking."),
    cloud_reset_update_required: t("Skytjenesten må oppdateres før denne huben kan tilbakestilles.", "The cloud service needs an update."),
  };
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
  const latest = readiness.data?.job;
  const job = submitted ? (latest?.id === submitted.id ? latest : submitted) : newAttempt ? null : latest;
  const running = busy || job?.status === "running";
  const stages: Record<string, string> = {
    inventory: t("Gjør huben klar", "Preparing your hub"),
    pause: t("Gjør huben klar", "Preparing your hub"),
    full_reset: t("Tilbakestiller hjemmet", "Resetting your home"),
    history: t("Rydder hjemmets historikk", "Clearing home history"),
    manual: t("Beholder enhetsparingene", "Keeping device pairings"),
  };
  const progressText = busy ? t("Starter tilbakestilling", "Starting reset") : readiness.isError ? t("Venter på kontakt med huben", "Waiting for the hub") : stages[job?.step || ""] || t("Tilbakestiller hjemmet", "Resetting your home");
  function close() { setOpen(false); setPassword(""); setConfirmation(""); setLoss(false); setPairing(false); setBackup(""); setManual(false); setError(""); }
  return <section className="factory-reset-panel">
    <div><AlertTriangle size={24} aria-hidden="true" /><h2>{t("Tilbakestill til fabrikkinnstillinger", "Factory reset")}</h2></div>
    <p>{t("Slett hjemmets oppsett, historikk og lokale brukere. Installerte apper beholdes. Du setter opp hjemmet på nytt fra Min side.", "Erase home configuration, history and local users. Installed apps are kept. Set up the home again from your account.")}</p>
    <button className="factory-reset-danger" onClick={() => setOpen(true)}><RotateCcw size={18} aria-hidden="true" />{t("Se hva som tilbakestilles", "Review factory reset")}</button>
    {open && <SettingsDialog title={t("Tilbakestill huben?", "Reset this hub?")} lang={lang} busy={busy} onClose={close} compact>
      {running ? <div className="factory-reset-progress">
        <div className={`factory-reset-orbit${readiness.isError && !busy ? " is-waiting" : ""}`} aria-hidden="true"><span /><House size={36} strokeWidth={1.5} /></div>
        <p className="factory-reset-eyebrow">{t("TILBAKESTILLING", "FACTORY RESET")}</p>
        <h3 role="status" aria-live="polite" aria-atomic="true">{progressText}</h3>
        <p>{readiness.isError && !busy ? t("Forbindelsen kan forsvinne når huben starter på nytt. Vi kan ikke bekrefte fremdriften akkurat nå. Se status på Min side.", "The connection may drop while the hub restarts. Progress cannot be confirmed right now. Check your account for status.") : t("Dette kan ta noen minutter. La huben være koblet til strøm og nettverk mens vi gjør den klar for nytt oppsett.", "This may take a few minutes. Keep the hub connected to power and the network while we prepare it for setup.")}</p>
        <small>{t("Kontoen din, QR-koden og enhetsparingene beholdes.", "Your account, QR code and device pairings are kept.")}</small>
        {readiness.isError && <a href="https://home.smarti.dev/">{t("Åpne Min side", "Open your account")}</a>}
      </div> : job ? <div className="factory-reset-form" aria-live="polite">
        <div className="factory-reset-outcome" aria-hidden="true">{job.status === "completed" ? <Check size={32} /> : <AlertTriangle size={32} />}</div>
        <h3>{job.status === "running" ? t("Tilbakestilling pågår", "Reset in progress") : job.status === "completed" ? t("Tilbakestilling fullført", "Reset complete") : t("Tilbakestillingen er ikke fullført", "Reset is incomplete")}</h3>
        <p>{job.status === "running" ? t("Ikke koble fra strømmen. Du kan komme tilbake hit for å se fremdriften.", "Keep the hub powered on. You can return here to check progress.") : t("Se rapporten nedenfor. Hvis tilbakestillingen er avbrutt, ikke forsøk å starte HA manuelt. Gå til Min side for status og nytt oppsett, eller kontakt support.", "Review the report below. If interrupted, do not start HA manually. Open your account for status and setup, or contact support.")}</p>
        <a href="https://home.smarti.dev/" target="_blank" rel="noreferrer">{t("Åpne Min side og skann hubens QR-kode", "Open your account and scan the hub QR code")}</a>
        {job.error && <p role="alert">{t("Prosessen stoppet eller ble avbrutt. Handlinger med ukjent resultat blir ikke gjentatt automatisk.", "The process stopped or was interrupted. Uncertain operations are not automatically repeated.")}</p>}
        <details className="factory-reset-report"><summary>{t("Se detaljer", "View details")}</summary><ul className="factory-reset-results">{job.results.map((r,i) => <li key={i}><strong>{r.name}</strong><span>{r.status === "done" ? t("Bekreftet utført", "Confirmed") : r.status === "pending" ? t("Venter", "Waiting") : r.status === "running" ? t("Pågår", "Working") : r.status === "manual" ? t("Må følges opp manuelt", "Manual follow-up required") : t("Ikke bekreftet utført", "Not confirmed")}</span>{r.status === "manual" || r.status === "unconfirmed" ? <small>{r.reason === "pairings_not_removed" ? t("Ingen enheter er paret bort. Du kan beholde paringene eller fjerne dem manuelt.", "No devices were unpaired. Keep pairings or remove them manually.") : r.reason === "zwave_exclusion_required" ? t("Fjern Z-Wave-enheten via ekskludering. Det kan kreve at du trykker på enheten.", "Remove the Z-Wave device through exclusion, which may require physical interaction.") : r.reason === "ha_owner_cleanup_required" ? t("HA tillater ikke sletting av eierkontoen gjennom dette grensesnittet.", "HA does not allow deleting its owner account through this interface.") : r.reason === "history_purge_requested" ? t("Sletting er bestilt hos HA. Fullføring må kontrolleres.", "HA received a purge request. Completion needs verification.") : r.reason === "yaml_cleanup_required" ? t("Oppsett i YAML må fjernes i HA.", "YAML configuration must be removed in HA.") : r.reason === "configuration_review_required" ? t("Kontroller integrasjoner, hjelpere, plassering, YAML-oppsett og gamle tilganger i HA. SMARTi-brukere og fjernaksess er ennå ikke nullstilt.", "Review integrations, helpers, location, YAML and existing access in HA. SMARTi users and remote access have not been reset yet.") : t("Kontroller enheten eller oppsettet i HA før du fortsetter. En fysisk nullstilling kan være nødvendig.", "Check the device or configuration in HA before continuing. A physical reset may be needed.")}</small> : null}</li>)}</ul></details>
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
        <p><strong>{t("Dette kan ikke angres.", "This cannot be undone.")}</strong> {t("Vi sletter hjemmets oppsett, rom, soner, automasjoner, scener og historikk. Det som slettes, kan ikke gjenopprettes uten sikkerhetskopi.", "We erase home configuration, rooms, zones, automations, scenes and history. Removed data requires a backup to restore.")}</p>
        <p>{t("Programvaren, hubens identitet og eierskapet på Min side beholdes. Dette overfører ikke huben til en ny eier.", "Software, hub identity and portal ownership are kept. This does not transfer the hub to another owner.")}</p>
        <aside className="factory-reset-warning"><AlertTriangle size={22} aria-hidden="true" /><div><strong>{t("Paringer fjernes ikke", "Pairings are not removed")}</strong><p>{t("Tilbakestillingen parer ikke bort enheter og nullstiller ikke radioene. Du kan beholde paringene. Hvis du vil fjerne dem eller pare enhetene et annet sted, må du gjøre dette manuelt etter produsentens veiledning.", "Reset does not unpair devices or reset radio controllers. You can keep pairings. To remove them or pair devices elsewhere, follow the manufacturer's manual reset instructions.")}</p></div></aside>
        <label>{t("Sikkerhetskopi", "Backup")}<select aria-label={t("Sikkerhetskopi", "Backup")} required value={backup} onChange={e => setBackup(e.target.value)}><option value="">{t("Velg før du fortsetter", "Choose before continuing")}</option><option value="saved">{t("Kopi lagret utenfor huben", "Backup saved outside this hub")}</option><option value="skip">{t("Fortsett uten sikkerhetskopi", "Continue without a backup")}</option></select></label>
        <p className="muted">{t("Du kan opprette og laste ned en kopi under Innstillinger → Sikkerhetskopiering før du fortsetter.", "Create and download a backup under Settings → Backups before continuing.")}</p>
        <label className="factory-reset-check"><input type="checkbox" required checked={loss} onChange={e => setLoss(e.target.checked)} />{t("Jeg forstår at hjemmets data slettes.", "I understand that home data will be erased.")}</label>
        <label className="factory-reset-check"><input type="checkbox" required checked={pairing} onChange={e => setPairing(e.target.checked)} />{t("Jeg forstår at paringer beholdes og at eventuell fjerning må gjøres manuelt.", "I understand pairings are retained and any removal must be performed manually.")}</label>
        <aside className="factory-reset-warning"><p>{t("HA-eier, lokale brukere, innlogginger, integrasjoner og hjemmets oppsett slettes. Du blir logget ut, og hele huben starter på nytt. SMARTi starter automatisk, mens HA venter til du har skannet QR-koden under huben og startet nytt oppsett. Kontoen din og eierskapet beholdes. Appene beholdes, men integrasjoner må kobles til på nytt.", "The HA owner, local users, sessions, integrations and home configuration are erased. You are signed out and the entire hub reboots. SMARTi starts automatically while HA waits for you to scan the hub QR code and begin setup. Your portal account, ownership and installed apps are kept; integrations must be connected again.")}</p></aside>
        <label className="factory-reset-check"><input type="checkbox" required checked={manual} onChange={e => setManual(e.target.checked)} />{t("Jeg forstår at jeg må sette opp hjemmet og koble til integrasjoner på nytt, og at noen paringer kan kreve manuell opprydding.", "I accept that reset may be incomplete and require manual cleanup.")}</label>
        <label>{t("Skriv RESET HUB for å bekrefte", "Type RESET HUB to confirm")}<input value={confirmation} onChange={e => setConfirmation(e.target.value)} autoComplete="off" spellCheck={false} required pattern="RESET HUB" /></label>
        <label>{t("Passordet til din administratorkonto", "Your administrator account password")}<input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" required maxLength={128} /></label>
        {readiness.isPending ? <p role="status">{t("Kontrollerer huben…", "Checking hub…")}</p> : !readiness.data?.ready && <p role="status" className="factory-reset-unavailable">{readiness.isError ? t("Kunne ikke kontrollere huben. Lukk dialogen og prøv igjen.", "Could not check the hub. Close this dialog and retry.") : (readiness.data?.blockers.map(code => blockers[code] || t("Kontrollen av huben feilet. Kontakt support.", "Hub checks failed. Contact support.")).join(" ") + " " + t("Ingen data er slettet.", "No data has been erased."))}</p>}
        {error && <p role="alert">{error}</p>}
        <div className="factory-reset-actions"><button type="button" disabled={busy} onClick={close}>{t("Avbryt", "Cancel")}</button><button className="factory-reset-danger" disabled={busy || !readiness.data?.ready || !password || confirmation !== "RESET HUB" || !loss || !pairing || !manual || !backup}>{t("Start tilbakestilling", "Start reset")}</button></div>
      </form>}
    </SettingsDialog>}
  </section>;
}
