import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../api";
import { SettingsDialog } from "../home/SettingsDialog";
import "./accessEditor.css";
const functions = [
  ["lights", "Lys", "Lights", true],
  ["climate", "Klima og luft", "Climate and air", true],
  ["media", "Multimedia", "Multimedia", true],
  [
    "security",
    "Låser, alarmer og sikkerhetssensorer",
    "Locks, alarms and security sensors",
    true,
  ],
  ["cameras", "Kameraer og livevideo", "Cameras and live video", false],
  ["energy", "Energi og elbil", "Energy and EV", false],
  ["people", "Personer og tilstedeværelse", "People and presence", false],
  ["calendar", "Kalender", "Calendar", false],
  ["other", "Andre enheter og sensorer", "Other devices and sensors", true],
  ["scenes", "Scener og rutiner", "Scenes and routines", true],
] as const;
const all = functions.flatMap(([id, , , control]) => [
  id + ".view",
  ...(control ? [id + ".control"] : []),
]);
export function AccessEditor({
  account,
  lang,
  onClose,
}: {
  account: {
    id: number;
    display_name: string;
    role: string;
    profile?: string;
    permissions?: string[];
  };
  lang: string;
  onClose: () => void;
}) {
  const t = (nb: string, en: string) => (lang === "en" ? en : nb),
    qc = useQueryClient();
  const [profile, setProfile] = useState(
    account.profile || (account.role === "admin" ? "admin" : "resident"),
  );
  const [permissions, setPermissions] = useState(account.permissions || all);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  function choose(value: string) {
    setProfile(value);
    if (value !== "custom")
      setPermissions(
        value === "viewer" ? all.filter((p) => p.endsWith(".view")) : all,
      );
  }
  function toggle(id: string, kind: string, checked: boolean) {
    setProfile("custom");
    setPermissions((old) => {
      const next = new Set(old);
      if (checked) {
        next.add(id + "." + kind);
        next.add(id + ".view");
      } else {
        next.delete(id + "." + kind);
        if (kind === "view") next.delete(id + ".control");
      }
      return [...next];
    });
  }
  async function save() {
    setBusy(true);
    setError("");
    try {
      await api("manage/accounts/" + account.id + "/access", "PUT", {
        profile,
        permissions,
      });
      await qc.invalidateQueries({ queryKey: ["accounts"] });
      await qc.invalidateQueries({ queryKey: ["home"] });
      onClose();
    } catch (e) {
      setError(
        e instanceof ApiError && e.status === 409
          ? t(
              "Du kan ikke fjerne din egen administratortilgang eller hjemmets siste administrator.",
              "You cannot remove your own administrator access or the home's last administrator.",
            )
          : t(
              "Kunne ikke lagre tilgangene. Prøv igjen.",
              "Could not save access. Try again.",
            ),
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <SettingsDialog
      title={t("Tilgang", "Access") + " · " + account.display_name}
      lang={lang}
      busy={busy}
      onClose={onClose}
    >
      <div className="access-editor">
        <p>
          {t(
            "Velg hva denne brukeren får se og styre i SMARTi. Bare administratorer kan endre brukere, integrasjoner og systeminnstillinger.",
            "Choose what this user can see and control in SMARTi. Only administrators can change users, integrations and system settings.",
          )}
        </p>
        <label>
          {t("Tilgangsprofil", "Access profile")}
          <select
            disabled={busy}
            value={profile}
            onChange={(e) => choose(e.target.value)}
          >
            <option value="admin">
              {t("Administrator – full tilgang", "Administrator – full access")}
            </option>
            <option value="resident">
              {t(
                "Beboer – se og styre hjemmet",
                "Resident – view and control home",
              )}
            </option>
            <option value="viewer">
              {t("Lesetilgang – bare se", "Viewer – view only")}
            </option>
            <option value="custom">{t("Tilpasset", "Custom")}</option>
          </select>
        </label>
        <div className="access-matrix">
          <div className="access-matrix-head">
            <strong>{t("Funksjon", "Function")}</strong>
            <span>{t("Se", "View")}</span>
            <span>{t("Styre", "Control")}</span>
          </div>
          {functions.map(([id, nb, en, control]) => (
            <div key={id}>
              <span>{t(nb, en)}</span>
              <input
                type="checkbox"
                aria-label={t(nb, en) + ": " + t("Se", "View")}
                checked={permissions.includes(id + ".view")}
                disabled={busy || profile === "admin"}
                onChange={(e) => toggle(id, "view", e.target.checked)}
              />
              {control ? (
                <input
                  type="checkbox"
                  aria-label={t(nb, en) + ": " + t("Styre", "Control")}
                  checked={permissions.includes(id + ".control")}
                  disabled={busy || profile === "admin"}
                  onChange={(e) => toggle(id, "control", e.target.checked)}
                />
              ) : (
                <span aria-label={t("Ikke relevant", "Not applicable")}>—</span>
              )}
            </div>
          ))}
        </div>
        <p className="access-note">
          {t(
            "Scener, rutiner og grupper kan påvirke flere funksjoner. Brukere med begrenset funksjonstilgang kan derfor ikke kjøre dem. Lesebrukere kan se, men ikke aktivere dem.",
            "Scenes, routines and groups can affect multiple functions. Users with restricted function access cannot run them. Viewers can see but cannot activate them.",
          )}
        </p>
        <p className="access-note">
          {t(
            "Dette gjelder innlogging i SMARTi. Rettigheter ved direkte innlogging i Home Assistant endres ikke. En person uten innloggingskonto har ingen egne tilganger.",
            "This applies to SMARTi login. Permissions for direct Home Assistant login are unchanged. A person without a login account has no access of their own.",
          )}
        </p>
        {error && <p role="alert">{error}</p>}
        <button className="primary" disabled={busy} onClick={() => void save()}>
          {busy ? t("Lagrer…", "Saving…") : t("Lagre tilgang", "Save access")}
        </button>
      </div>
    </SettingsDialog>
  );
}
