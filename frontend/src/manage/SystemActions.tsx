import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { SettingsDialog } from "../home/SettingsDialog";
type Operation = { status: string; job_id?: string; progress?: number };
type NetworkConfig = {
  interface: string;
  type: string;
  revision: string;
  ssid?: string;
  ipv4: {
    method: string;
    address: string[] | null;
    gateway: string | null;
    nameservers: string[] | null;
  };
};
export function SystemActions({
  lang,
  network,
}: {
  lang: string;
  network?: string;
}) {
  const en = lang === "en",
    t = (nb: string, enText: string) => (en ? enText : nb);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [confirmed, confirm] = useState(false);
  const [id, setId] = useState(""),
    [result, setResult] = useState<Operation | null>(null);
  const [name, setName] = useState("SMARTi"),
    [password, setPassword] = useState(""),
    [ssid, setSsid] = useState(""),
    [wifi, setWifi] = useState(false),
    [wifiAuth, setWifiAuth] = useState("wpa-psk");
  const [method, setMethod] = useState("auto"),
    [address, setAddress] = useState(""),
    [gateway, setGateway] = useState(""),
    [dns, setDns] = useState(""),
    [revision, setRevision] = useState(""),
    [wireless, setWireless] = useState(false);
  const status = useQuery({
    queryKey: ["system-operation", id],
    queryFn: () => api<Operation>(`manage/settings/operations/${id}`),
    enabled: !!result?.job_id && result.status === "accepted",
    refetchInterval: (q) =>
      ["completed", "failed"].includes(q.state.data?.status || "")
        ? false
        : 3000,
  });
  const state = status.data || result;
  async function start() {
    setOpen(true);
    setError("");
    setResult(null);
    setId(crypto.randomUUID());
    confirm(false);
    setPassword("");
    setWifi(false);
    setBusy(true);
    try {
      if (network) {
        const n = await api<NetworkConfig>(
          `manage/settings/network/${encodeURIComponent(network)}`,
        );
        setMethod(n.ipv4.method === "static" ? "static" : "auto");
        setAddress((n.ipv4.address || []).join(", "));
        setGateway(n.ipv4.gateway || "");
        setDns((n.ipv4.nameservers || []).join(", "));
        setRevision(n.revision);
        setSsid(n.ssid || "");
        setWireless(n.type === "wireless");
      }
    } catch {
      setError(
        t(
          "Kunne ikke hente nettverksoppsettet. Lukk og prøv igjen.",
          "Could not load network settings. Close and retry.",
        ),
      );
      setRevision("");
    } finally {
      setBusy(false);
    }
  }
  async function submit() {
    setBusy(true);
    setError("");
    try {
      const split = (s: string) =>
        s
          .split(",")
          .map((v) => v.trim())
          .filter(Boolean);
      const r = await api<Operation>(
        network
          ? `manage/settings/network/${encodeURIComponent(network)}`
          : "manage/settings/backups",
        network ? "PUT" : "POST",
        network
          ? {
              request_id: id,
              revision,
              ipv4: {
                method,
                address: method === "static" ? split(address) : [],
                gateway: method === "static" ? gateway : "",
                nameservers: method === "static" ? split(dns) : [],
              },
              ...(wifi
                ? { wifi: { ssid, auth: wifiAuth, psk: password } }
                : {}),
            }
          : { request_id: id, name, password },
      );
      setResult(r);
      setPassword("");
      void qc.invalidateQueries({ queryKey: ["settings", "system"] });
    } catch {
      setError(
        network
          ? t(
              "Endringen er ikke bekreftet. Forbindelsen kan ha blitt brutt. Kontroller sentralens adresse før du prøver igjen. Oppsettet kan også ha blitt endret av andre.",
              "Change unconfirmed. The connection may have dropped. Check the controller address before retrying; settings may also have changed.",
            )
          : t(
              "Kunne ikke bekrefte oppstart. Kontroller sikkerhetskopilisten før nytt forsøk.",
              "Could not confirm start. Check the backup list before trying again.",
            ),
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <button disabled={busy} onClick={() => void start()}>
        {network
          ? t("Endre nettverk", "Edit network")
          : t("Ta sikkerhetskopi", "Create backup")}
      </button>
      {open && (
        <SettingsDialog
          lang={lang}
          busy={busy}
          title={
            network
              ? t(`Nettverk · ${network}`, `Network · ${network}`)
              : t("Ny sikkerhetskopi", "New backup")
          }
          onClose={() => {
            setOpen(false);
            setPassword("");
          }}
        >
          {error && (
            <p role="alert" className="notice">
              {error}
            </p>
          )}
          {state ? (
            <div role="status">
              <h3>
                {state.status === "completed"
                  ? t("Sikkerhetskopien er fullført", "Backup completed")
                  : state.status === "failed"
                    ? t("Sikkerhetskopieringen feilet", "Backup failed")
                    : state.status === "accepted"
                      ? network
                        ? t(
                            "Endringen er sendt til sentralen",
                            "Change sent to controller",
                          )
                        : t("Sikkerhetskopiering er startet", "Backup started")
                      : t("Resultatet er ikke bekreftet", "Result unconfirmed")}
              </h3>
              <p>
                {network
                  ? t(
                      "Kontroller nettverk og IP-adresse i oversikten. Dersom forbindelsen er borte, åpne sentralens nye adresse eller bruk lokal tilgang.",
                      "Check network and IP address in the overview. If disconnected, open the new controller address or use local access.",
                    )
                  : t(
                      "Sjekk sikkerhetskopilisten for den ferdige kopien. Behold passordet; det trengs ved gjenoppretting.",
                      "Check the backup list for the finished backup. Keep the password; it is needed to restore.",
                    )}
              </p>
              {typeof state.progress === "number" && (
                <progress value={state.progress} max={100} />
              )}{" "}
              {status.isError && (
                <p>
                  {t(
                    "Kunne ikke hente jobbstatus. Sjekk sikkerhetskopilisten.",
                    "Could not load job status. Check the backup list.",
                  )}
                </p>
              )}
              <button
                onClick={() => {
                  setOpen(false);
                  void qc.invalidateQueries({
                    queryKey: ["settings", "system"],
                  });
                }}
              >
                {t("Lukk", "Close")}
              </button>
            </div>
          ) : (
            <form
              className="system-settings-form"
              onSubmit={(e) => {
                e.preventDefault();
                if (network && !confirmed) confirm(true);
                else void submit();
              }}
            >
              {network ? (
                <>
                  {confirmed ? (
                    <>
                      <h3>
                        {t(
                          "Bekreft nettverksendringen",
                          "Confirm network change",
                        )}
                      </h3>
                      <p>
                        {network} · {method === "auto" ? "DHCP" : address}
                      </p>
                      <p>
                        {t(
                          "Dette kan koble fra SMARTi. Sørg for at du kan nå sentralen lokalt hvis adressen endres. IPv6 beholdes.",
                          "This can disconnect SMARTi. Make sure you can reach the controller locally if its address changes. IPv6 is preserved.",
                        )}
                      </p>
                      <button type="button" onClick={() => confirm(false)}>
                        {t("Tilbake", "Back")}
                      </button>
                    </>
                  ) : (
                    <>
                      <label>
                        {t("IP-oppsett", "IP configuration")}
                        <select
                          disabled={busy}
                          value={method}
                          onChange={(e) => setMethod(e.target.value)}
                        >
                          <option value="auto">DHCP</option>
                          <option value="static">
                            {t("Fast IP", "Static IP")}
                          </option>
                        </select>
                      </label>
                      {method === "static" && (
                        <>
                          <label>
                            {t(
                              "IP-adresse med nettmaske",
                              "IP address with prefix",
                            )}
                            <input
                              disabled={busy}
                              required
                              placeholder="192.168.1.10/24"
                              value={address}
                              onChange={(e) => setAddress(e.target.value)}
                            />
                          </label>
                          <label>
                            Gateway
                            <input
                              disabled={busy}
                              value={gateway}
                              onChange={(e) => setGateway(e.target.value)}
                            />
                          </label>
                          <label>
                            {t(
                              "DNS-servere (komma mellom)",
                              "DNS servers (comma separated)",
                            )}
                            <input
                              disabled={busy}
                              value={dns}
                              onChange={(e) => setDns(e.target.value)}
                            />
                          </label>
                        </>
                      )}
                      {wireless && (
                        <>
                          <label className="check-label">
                            <input
                              disabled={busy}
                              type="checkbox"
                              checked={wifi}
                              onChange={(e) => setWifi(e.target.checked)}
                            />
                            {t(
                              "Endre Wi-Fi-tilkobling",
                              "Change Wi-Fi connection",
                            )}
                          </label>
                          {wifi && (
                            <>
                              <label>
                                SSID
                                <input
                                  disabled={busy}
                                  required
                                  maxLength={32}
                                  value={ssid}
                                  onChange={(e) => setSsid(e.target.value)}
                                />
                              </label>
                              <label>
                                {t("Sikkerhet", "Security")}
                                <select
                                  disabled={busy}
                                  value={wifiAuth}
                                  onChange={(e) => setWifiAuth(e.target.value)}
                                >
                                  <option value="wpa-psk">
                                    WPA / WPA2 Personal
                                  </option>
                                  <option value="open">
                                    {t("Åpent nettverk", "Open network")}
                                  </option>
                                </select>
                              </label>
                              {wifiAuth !== "open" && (
                                <label>
                                  {t("Wi-Fi-passord", "Wi-Fi password")}
                                  <input
                                    disabled={busy}
                                    type="password"
                                    autoComplete="new-password"
                                    required
                                    minLength={8}
                                    maxLength={64}
                                    value={password}
                                    onChange={(e) =>
                                      setPassword(e.target.value)
                                    }
                                  />
                                </label>
                              )}
                            </>
                          )}
                        </>
                      )}
                    </>
                  )}
                </>
              ) : (
                <>
                  <p>
                    {t(
                      "Full sikkerhetskopi av sentralen og appene, lagret på sentralen. Ta vare på passordet før du starter.",
                      "Full backup of the controller and apps, stored on the controller. Keep the password before starting.",
                    )}
                  </p>
                  <label>
                    {t("Navn", "Name")}
                    <input
                      disabled={busy}
                      required
                      maxLength={80}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </label>
                  <label>
                    {t("Passord for sikkerhetskopien", "Backup password")}
                    <input
                      disabled={busy}
                      type="password"
                      autoComplete="new-password"
                      required
                      minLength={12}
                      maxLength={128}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </label>
                </>
              )}
              <button
                className="primary compact"
                disabled={busy || (!!network && !revision)}
              >
                {busy
                  ? t("Sender …", "Sending …")
                  : network
                    ? confirmed
                      ? t(
                          "Bekreft og endre nettverk",
                          "Confirm and change network",
                        )
                      : t("Se over endringen", "Review change")
                    : t("Start sikkerhetskopiering", "Start backup")}
              </button>
            </form>
          )}
        </SettingsDialog>
      )}
    </>
  );
}
