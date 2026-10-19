import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Globe, Link, ShieldOff } from "lucide-react";
import { api, ApiError } from "../api";
import { SettingsDialog } from "../home/SettingsDialog";

type Status = {
  provisioned: boolean;
  linked?: boolean;
  remote_enabled?: boolean;
};
type Claim = { code: string; expires_at: number };
export function RemoteAccess({ lang }: { lang: string }) {
  const t = (nb: string, en: string) => (lang === "en" ? en : nb);
  const [open, setOpen] = useState(false),
    [claim, setClaim] = useState<Claim | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [hubId, setHubId] = useState("");
  const [connectionKey, setConnectionKey] = useState("");
  const [saved, setSaved] = useState(false);
  const [restartRequired, setRestartRequired] = useState(false);
  async function provision() {
    setBusy(true); setError("");
    try {
      const result = await api<{restart_required: boolean}>("remote/provision", "POST", {
        installation_id: hubId.trim(), credential: connectionKey.trim(),
      }, AbortSignal.timeout(15000));
      setConnectionKey(""); setHubId(""); setSaved(true);
      setRestartRequired(result.restart_required);
      await q.refetch();
    } catch (e) {
      setError(e instanceof ApiError && e.status === 422
        ? t("Hub-ID eller tilkoblingsnøkkel er ugyldig. Kontroller begge verdiene.", "The Hub ID or connection key is invalid. Check both values.")
        : e instanceof ApiError && e.status === 409
          ? t("Huben er allerede klargjort, eller identiteten er koblet til et annet hjem. Kontroller statusen før du fortsetter.", "The hub is already provisioned, or this identity belongs to a linked home. Check the status before continuing.")
          : t("Kunne ikke bekrefte eller lagre oppsettet. Kontroller forbindelsen og prøv igjen.", "Could not verify or save setup. Check the connection and try again."));
      await q.refetch();
    } finally { setBusy(false); }
  }
  const [now, setNow] = useState(Date.now());
  const q = useQuery({
    queryKey: ["remote-access"],
    queryFn: () => api<Status>("remote"),
    retry: false,
    refetchInterval: open ? 5000 : false,
  });
  useEffect(() => {
    if (!open) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [open]);
  useEffect(() => {
    if (q.data?.linked) setClaim(null);
  }, [q.data?.linked]);
  const remaining = claim
    ? Math.max(0, Math.ceil(claim.expires_at - now / 1000))
    : 0;
  async function action(path: string, method: string) {
    setBusy(true);
    setError("");
    try {
      const result = await api<Claim>(
        path,
        method,
        undefined,
        AbortSignal.timeout(15000),
      );
      setClaim(method === "POST" ? result : null);
      await q.refetch();
    } catch {
      setError(
        t(
          "Kunne ikke bekrefte endringen. Kontroller forbindelsen og prøv igjen.",
          "Could not confirm the change. Check the connection and try again.",
        ),
      );
    } finally {
      setBusy(false);
    }
  }
  const status = q.isPending
    ? t("Henter status…", "Loading status…")
    : q.isError
      ? t("Status er utilgjengelig", "Status unavailable")
      : !q.data?.provisioned
        ? t("Huben må klargjøres først", "Hub provisioning required")
        : q.data.remote_enabled === false
          ? t("Fjerntilgang er slått av", "Remote access disabled")
          : q.data.linked
            ? t("Koblet til SMARTi-konto", "Linked to a SMARTi account")
            : t("Klar til å koble til konto", "Ready to link an account");
  return (
    <section className="settings-panel">
      <h3>
        <Globe /> {t("Fjerntilgang", "Remote access")}
      </h3>
      <p>{status}</p>
      <p>
        {t(
          "Administrer koblingen mellom dette hjemmet og kontoen din på home.smarti.dev.",
          "Manage the link between this home and your account at home.smarti.dev.",
        )}
      </p>
      <button onClick={() => setOpen(true)}>
        <Link size={18} />
        {t("Administrer fjerntilgang", "Manage remote access")}
      </button>
      {open && (
        <SettingsDialog
          title={t("Fjerntilgang", "Remote access")}
          lang={lang}
          busy={busy}
          onClose={() => {
            setOpen(false);
            setClaim(null);
            setError("");
            setConnectionKey("");
            setHubId("");
          }}
        >
          <p>{status}</p>
          {saved && <p role="status">{restartRequired
            ? t("Oppsettet er lagret. Start SMARTi-appen på nytt før du fortsetter.", "Setup saved. Restart the SMARTi app before continuing.")
            : t("Huben er klargjort. Hent en engangskode nedenfor for å koble hjemmet til kontoen din.", "Hub setup complete. Request a one-time code below to link your home.")}</p>}
          {q.data?.provisioned === false && (
            <form onSubmit={(e) => { e.preventDefault(); void provision(); }}>
              <h3>{t("Klargjør denne huben", "Set up this hub")}</h3>
              <p>{t("Fyll inn verdiene du har fått fra SMARTi. Vi kontrollerer dem før oppsettet lagres. Dette er ikke bootstrap-nøkkelen eller Home Assistant-passordet.", "Enter the values supplied by SMARTi. We verify them before saving. This is not the bootstrap secret or your Home Assistant password.")}</p>
              <label>{t("Hub-ID", "Hub ID")}
                <input value={hubId} onChange={(e) => setHubId(e.target.value)} required disabled={busy}
                  autoComplete="off" spellCheck={false} autoCapitalize="none" maxLength={36}
                  pattern="[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}" />
              </label>
              <label>{t("Tilkoblingsnøkkel", "Connection key")}
                <input type="password" value={connectionKey} onChange={(e) => setConnectionKey(e.target.value)}
                  required disabled={busy} autoComplete="off" spellCheck={false} autoCapitalize="none"
                  minLength={32} maxLength={256} />
              </label>
              <button type="submit" disabled={busy || !hubId.trim() || connectionKey.trim().length < 32}>
                {busy ? t("Kontrollerer…", "Verifying…") : t("Kontroller og lagre", "Verify and save")}
              </button>
            </form>
          )}
          {q.data?.provisioned &&
            !q.data.linked &&
            q.data.remote_enabled !== false && (
              <>
                <p>
                  {t(
                    "Logg inn på home.smarti.dev og velg Koble til et hjem. Skriv inn engangskoden nedenfor. En ny kode erstatter den gamle.",
                    "Sign in at home.smarti.dev and select Link a home. Enter the one-time code below. A new code replaces the old one.",
                  )}
                </p>
                {claim && remaining > 0 && (
                  <label>
                    {t("Engangskode", "One-time code")}
                    <input
                      readOnly
                      value={claim.code}
                      onFocus={(e) => e.target.select()}
                      autoComplete="off"
                    />
                    <small>
                      {t("Gyldig i", "Valid for")} {Math.ceil(remaining / 60)}{" "}
                      {t("minutter", "minutes")}
                    </small>
                  </label>
                )}
                {claim && remaining === 0 && (
                  <p role="status">
                    {t(
                      "Koden har utløpt. Hent en ny kode.",
                      "The code expired. Request a new one.",
                    )}
                  </p>
                )}
                <button
                  disabled={busy}
                  onClick={() => void action("remote/claim-code", "POST")}
                >
                  {t("Hent engangskode", "Get one-time code")}
                </button>
                {claim && (
                  <button
                    disabled={busy}
                    onClick={() => void action("remote/claim-code", "DELETE")}
                  >
                    {t("Avbryt koden", "Cancel code")}
                  </button>
                )}
              </>
            )}
          {q.data?.linked && (
            <p>
              {t(
                "Kontokoblingen er lagret. Dette er ikke en bekreftelse på at tunnelen er tilkoblet. Hjemmets brukerkontoer og tilganger gjelder fortsatt.",
                "Account linking is saved. This does not confirm tunnel connectivity. Local home accounts and permissions still apply.",
              )}
            </p>
          )}
          {q.data?.provisioned && q.data.remote_enabled === false && (
            <button
              disabled={busy}
              onClick={() => void action("remote", "PUT")}
            >
              {t("Tillat fjerntilgang igjen", "Allow remote access again")}
            </button>
          )}
          {q.data?.provisioned && q.data.remote_enabled && (
            <button
              disabled={busy}
              onClick={() => {
                if (
                  window.confirm(
                    t(
                      "Slå av fjerntilgang til dette hjemmet? Lokal tilgang beholdes.",
                      "Disable remote access to this home? Local access remains available.",
                    ),
                  )
                )
                  void action("remote", "DELETE");
              }}
            >
              <ShieldOff size={18} />
              {t("Slå av fjerntilgang", "Disable remote access")}
            </button>
          )}
          {busy && (
            <p role="status">
              {t("Venter på bekreftelse…", "Waiting for confirmation…")}
            </p>
          )}
          {error && <p role="alert">{error}</p>}
        </SettingsDialog>
      )}
    </section>
  );
}
