import { AccessEditor } from "./AccessEditor";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  UserPlus,
  CheckCircle2,
  Shield,
  Camera,
  UserRound,
} from "lucide-react";
import { api, ApiError } from "../api";
import { SettingsDialog } from "../home/SettingsDialog";
type Account = {
  id: number;
  name: string;
  display_name: string;
  role: string;
  profile?: string;
  permissions?: string[];
  linked: boolean;
  ha_user_id?: string;
  photo: boolean;
};
type Result = {
  request_id?: string;
  status: string;
  name: string;
  display_name: string;
  role: string;
  local_id?: number;
  ha_user_id?: string;
};
export async function readPhoto(file: File) {
  if (
    !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
    file.size > 10000000
  )
    throw Error("photo");
  const img = await createImageBitmap(file),
    canvas = document.createElement("canvas");
  canvas.width = canvas.height = 512;
  const size = Math.min(img.width, img.height);
  canvas
    .getContext("2d")!
    .drawImage(
      img,
      (img.width - size) / 2,
      (img.height - size) / 2,
      size,
      size,
      0,
      0,
      512,
      512,
    );
  img.close();
  return canvas.toDataURL("image/jpeg", 0.85).split(",")[1];
}
export type HouseholdPerson = {
  id: string;
  name: string;
  device_trackers: string[];
  editable: boolean;
  user_id?: string;
  entity_id?: string;
};
export function HouseholdPhoto({ src, name }: { src?: string; name: string }) {
  const [failed, setFailed] = useState("");
  return src && failed !== src ? (
    <img src={src} alt={name} onError={() => setFailed(src)} />
  ) : (
    <span className="account-initial" aria-label={name}>
      <UserRound size={26} />
    </span>
  );
}
export function Accounts({
  lang,
  people = [],
  onPerson,
  children,
}: {
  lang: string;
  people?: HouseholdPerson[];
  onPerson?: (person: HouseholdPerson) => void;
  children?: React.ReactNode;
}) {
  const t = (nb: string, en: string) => (lang === "en" ? en : nb),
    qc = useQueryClient();
  const accounts = useQuery({
    queryKey: ["accounts"],
    queryFn: () => api<Account[]>("manage/accounts"),
  });
  const pending = useQuery({
    queryKey: ["account-pending"],
    queryFn: () => api<Result[]>("manage/accounts/pending"),
  });
  const [access, setAccess] = useState<Account | null>(null);
  const [open, setOpen] = useState(false),
    [step, setStep] = useState(0),
    [id, setId] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [name, setName] = useState(""),
    [display, setDisplay] = useState(""),
    [password, setPassword] = useState(""),
    [repeat, setRepeat] = useState(""),
    [role, setRole] = useState("user"),
    [photo, setPhoto] = useState(""),
    [result, setResult] = useState<Result | null>(null),
    [editing, setEditing] = useState<Account | null>(null),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    const refresh = () => setRevision((v) => v + 1);
    window.addEventListener("smarti-profile-photo", refresh);
    return () => window.removeEventListener("smarti-profile-photo", refresh);
  }, []);
  function close() {
    setOpen(false);
    setPassword("");
    setRepeat("");
    setPhoto("");
    setEditing(null);
  }
  function start(p?: Result) {
    setId(p?.request_id || crypto.randomUUID());
    setName(p?.name || "");
    setDisplay(p?.display_name || "");
    setRole(p?.role || "user");
    setPassword("");
    setRepeat("");
    setPhoto("");
    setResult(null);
    setEditing(null);
    setError("");
    setStep(0);
    setOpen(true);
  }
  async function create() {
    setBusy(true);
    setError("");
    try {
      const r = await api<Result>("manage/accounts", "POST", {
        request_id: id,
        name,
        display_name: display,
        password,
        role,
        photo,
      });
      setResult(r);
      if (r.status === "completed") {
        setPassword("");
        setRepeat("");
      }
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["accounts"] }),
        qc.invalidateQueries({ queryKey: ["settings", "people"] }),
        qc.invalidateQueries({ queryKey: ["account-pending"] }),
        qc.invalidateQueries({ queryKey: ["home"] }),
      ]);
    } catch (e) {
      setError(
        e instanceof ApiError && e.status === 409
          ? t(
              "Brukernavnet finnes allerede eller har et ufullført oppsett. Åpne det ufullførte oppsettet i oversikten.",
              "Username already exists or has an unfinished setup. Open the unfinished setup in the list.",
            )
          : t(
              "Kunne ikke fullføre. Kontroller tilkobling, rettigheter og feltene. Ingen oppretting vises som vellykket uten bekreftelse.",
              "Could not complete. Check connection, permissions and fields. Creation is only shown as successful when confirmed.",
            ),
      );
    } finally {
      setBusy(false);
    }
  }
  async function pick(file: File) {
    setBusy(true);
    setError("");
    try {
      setPhoto(await readPhoto(file));
    } catch {
      setError(
        t(
          "Velg et gyldig JPG-, PNG- eller WebP-bilde under 10 MB.",
          "Choose a valid JPG, PNG or WebP image under 10 MB.",
        ),
      );
    } finally {
      setBusy(false);
    }
  }
  async function savePhoto() {
    if (!editing) return;
    setBusy(true);
    setError("");
    try {
      const r = await api<{ controller_saved: boolean }>(
        `manage/accounts/${editing.id}/photo`,
        "PUT",
        { photo },
      );
      setRevision((v) => v + 1);
      window.dispatchEvent(new Event("smarti-profile-photo"));
      await qc.invalidateQueries({ queryKey: ["accounts"] });
      if (editing.linked && !r.controller_saved)
        setError(
          t(
            "Bildet er lagret i SMARTi, men kunne ikke synkroniseres til sentralen. Prøv igjen.",
            "Saved in SMARTi, but could not sync to the controller. Retry.",
          ),
        );
      else close();
    } catch {
      setError(t("Kunne ikke lagre bildet.", "Could not save photo."));
    } finally {
      setBusy(false);
    }
  }
  const photoInput = (
    <div className="account-photo-editor">
      {photo ? (
        <img
          src={"data:image/jpeg;base64," + photo}
          alt={t("Forhåndsvisning av profilbilde", "Profile photo preview")}
        />
      ) : (
        <Camera size={42} />
      )}
      <label>
        {t("Last opp profilbilde", "Upload profile photo")}
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          disabled={busy}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void pick(file);
          }}
        />
      </label>
    </div>
  );
  return (
    <section className="settings-panel account-management">
      <div className="section-heading">
        <h2>
          <Shield size={21} />
          {t("Husstanden", "Household")}
        </h2>
        <button onClick={() => start()}>
          <UserPlus size={18} />
          {t("Legg til bruker", "Add user")}
        </button>
      </div>
      <p>
        {t(
          "Personer, innlogging, profilbilder og tilstedeværelse – samlet på ett sted.",
          "People, logins, profile photos and presence — all in one place.",
        )}
      </p>
      {accounts.isError && (
        <p role="alert">
          {t("Kunne ikke hente brukere.", "Could not load users.")}
        </p>
      )}
      {onPerson && (
        <button
          onClick={() =>
            onPerson({ id: "", name: "", device_trackers: [], editable: true })
          }
        >
          {t("Legg til person uten innlogging", "Add person without login")}
        </button>
      )}
      {accounts.data?.map((a) => (
        <div className="system-list-row" key={a.id}>
          <div className="account-person">
            <HouseholdPhoto
              name={a.display_name}
              src={
                a.photo
                  ? `api/manage/accounts/${a.id}/photo?v=${revision}`
                  : people.find((p) => p.user_id && p.user_id === a.ha_user_id)
                        ?.entity_id
                    ? `api/home/people/${encodeURIComponent(people.find((p) => p.user_id && p.user_id === a.ha_user_id)!.entity_id!)}/photo?v=${revision}`
                    : undefined
              }
            />
            <div>
              <strong>{a.display_name}</strong>
              <small>
                {a.name} ·{" "}
                {a.role === "admin"
                  ? t("Administrator", "Administrator")
                  : a.profile === "viewer"
                    ? t("Lesetilgang", "Viewer")
                    : a.profile === "custom"
                      ? t("Tilpasset tilgang", "Custom access")
                      : t("Beboer", "Resident")}{" "}
                ·{" "}
                {a.linked
                  ? t("Innlogging i app og sentral", "App and controller login")
                  : t("SMARTi-konto", "SMARTi account")}
              </small>
            </div>
          </div>
          <div className="row-actions">
            <button onClick={() => setAccess(a)}>
              <Shield size={16} />
              {t("Tilgang", "Access")}
            </button>
            {people
              .filter((p) => !!p.user_id && p.user_id === a.ha_user_id)
              .map((p) => (
                <button
                  key={p.id}
                  disabled={!p.editable}
                  onClick={() => onPerson?.(p)}
                >
                  {t("Person og tilstedeværelse", "Person and presence")} ·{" "}
                  {p.device_trackers.length}
                </button>
              ))}
            <button
              onClick={() => {
                setEditing(a);
                setPhoto("");
                setError("");
                setOpen(true);
              }}
            >
              {t("Profilbilde", "Profile photo")}
            </button>
          </div>
        </div>
      ))}
      {accounts.data &&
        people
          .filter(
            (p) =>
              !p.user_id ||
              !accounts.data.some((a) => a.ha_user_id === p.user_id),
          )
          .map((p) => (
            <div className="system-list-row" key={p.id}>
              <div className="account-person">
                <HouseholdPhoto
                  name={p.name}
                  src={
                    p.entity_id
                      ? `api/home/people/${encodeURIComponent(p.entity_id)}/photo?v=${revision}`
                      : undefined
                  }
                />
                <div>
                  <strong>{p.name}</strong>
                  <small>
                    {p.user_id
                      ? t("Konto på sentralen", "Controller account")
                      : t(
                          "Person uten innlogging",
                          "Person without login",
                        )}{" "}
                    · {p.device_trackers.length}{" "}
                    {t("tilstedeværelsesenheter", "presence trackers")}
                  </small>
                </div>
              </div>
              <button disabled={!p.editable} onClick={() => onPerson?.(p)}>
                {t("Rediger person", "Edit person")}
              </button>
            </div>
          ))}
      {children}
      {pending.data?.map((p) => (
        <div className="system-list-row" key={p.request_id}>
          <span>
            {p.display_name} · {t("Oppsett ikke fullført", "Setup unfinished")}
          </span>
          <button onClick={() => start(p)}>
            {t("Kontroller og fullfør", "Check and finish")}
          </button>
        </div>
      ))}
      {access && (
        <AccessEditor
          account={access}
          lang={lang}
          onClose={() => setAccess(null)}
        />
      )}
      {open && (
        <SettingsDialog
          lang={lang}
          busy={busy}
          title={
            editing
              ? t("Endre profilbilde", "Change profile photo")
              : t("En ny bruker i hjemmet", "A new user in your home")
          }
          onClose={close}
        >
          {error && (
            <p className="notice" role="alert">
              {error}
            </p>
          )}
          {editing ? (
            <>
              {photoInput}
              <div className="row-actions">
                <button
                  className="primary compact"
                  disabled={busy || !photo}
                  onClick={() => void savePhoto()}
                >
                  {t("Lagre profilbilde", "Save profile photo")}
                </button>
              </div>
            </>
          ) : result ? (
            <div role="status">
              <h3>
                {result.status === "completed" ? (
                  <>
                    <CheckCircle2 />
                    {t("Brukeren er klar", "User is ready")}
                  </>
                ) : (
                  t(
                    "Oppsettet er delvis fullført",
                    "Setup is partially complete",
                  )
                )}
              </h3>
              <p>
                {result.status === "completed"
                  ? t(
                      "Brukernavn og passord kan brukes i både SMARTi og sentralen. Senere passordendringer synkroniseres ikke automatisk.",
                      "The username and password work in SMARTi and the controller. Later password changes are not automatically synchronized.",
                    )
                  : result.local_id
                    ? t(
                        "Begge kontoene er opprettet, men personprofilen eller bildet mangler. Du kan kontrollere og fullføre oppsettet.",
                        "Both accounts exist, but the person profile or photo is missing. You can check and finish setup.",
                      )
                    : t(
                        "Opprettingen i sentralen er ikke fullt bekreftet. Kontroller kontoen i sentralen før du fortsetter. Samme forespørsel oppretter ikke flere brukere.",
                        "Controller account creation is not fully confirmed. Check the account in the controller before continuing. The same request will not create duplicate users.",
                      )}
              </p>
              <strong>{result.name}</strong>
              <div className="row-actions">
                {result.status !== "completed" && (
                  <button disabled={busy} onClick={() => void create()}>
                    {t("Kontroller og fullfør", "Check and finish")}
                  </button>
                )}
                <button onClick={close}>{t("Ferdig", "Done")}</button>
              </div>
            </div>
          ) : (
            <form
              className="system-settings-form"
              onSubmit={(e) => {
                e.preventDefault();
                setError("");
                if (step === 0) {
                  if (password !== repeat) {
                    setError(
                      t("Passordene må være like.", "Passwords must match."),
                    );
                    return;
                  }
                  setStep(1);
                } else if (step === 1) setStep(2);
                else void create();
              }}
            >
              <p className="eyebrow">
                {t(`Trinn ${step + 1} av 3`, `Step ${step + 1} of 3`)} ·{" "}
                {step === 0
                  ? t("Innlogging", "Login")
                  : step === 1
                    ? t("Profil og tilgang", "Profile and access")
                    : t("Se over", "Review")}
              </p>
              {step === 0 ? (
                <>
                  <label>
                    {t("Navn som vises", "Display name")}
                    <input
                      required
                      maxLength={80}
                      value={display}
                      onChange={(e) => setDisplay(e.target.value)}
                    />
                  </label>
                  <label>
                    {t("Brukernavn", "Username")}
                    <input
                      required
                      aria-label={t("Brukernavn", "Username")}
                      pattern={"[a-z0-9][a-z0-9_.\\-]{1,79}"}
                      autoComplete="off"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                    <small>
                      {t(
                        "Små bokstaver, tall, punktum, bindestrek eller understrek.",
                        "Lowercase letters, numbers, dots, hyphens or underscores.",
                      )}
                    </small>
                  </label>
                  <label>
                    {t(
                      "Passord (minst 12 tegn)",
                      "Password (at least 12 characters)",
                    )}
                    <input
                      required
                      type="password"
                      minLength={12}
                      maxLength={128}
                      autoComplete="new-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </label>
                  <label>
                    {t("Gjenta passord", "Repeat password")}
                    <input
                      required
                      type="password"
                      autoComplete="new-password"
                      value={repeat}
                      onChange={(e) => setRepeat(e.target.value)}
                    />
                  </label>
                </>
              ) : step === 1 ? (
                <>
                  {photoInput}
                  <label>
                    {t("Tilgang", "Access")}
                    <select
                      value={role}
                      onChange={(e) => setRole(e.target.value)}
                    >
                      <option value="user">
                        {t("Bruker – styr hjemmet", "User – control the home")}
                      </option>
                      <option value="admin">
                        {t(
                          "Administrator – administrer hjem og brukere",
                          "Administrator – manage home and users",
                        )}
                      </option>
                    </select>
                  </label>
                  <p>
                    {t(
                      "Rollen gjelder i begge systemene. Profilen blir også lagt til som person i hjemmet.",
                      "The role applies in both systems. A household person profile is also created.",
                    )}
                  </p>
                </>
              ) : (
                <>
                  <h3>{display}</h3>
                  <p>
                    {name} ·{" "}
                    {role === "admin"
                      ? t("Administrator", "Administrator")
                      : t("Bruker", "User")}
                  </p>
                  <p>
                    {t(
                      "Oppretter kontoer i SMARTi og sentralen med samme innloggingsdetaljer.",
                      "Creates accounts in SMARTi and the controller with the same login details.",
                    )}
                  </p>
                  {photo && (
                    <img
                      className="account-review-photo"
                      src={"data:image/jpeg;base64," + photo}
                      alt=""
                    />
                  )}
                </>
              )}
              <div className="row-actions">
                {step > 0 && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setStep(step - 1)}
                  >
                    {t("Tilbake", "Back")}
                  </button>
                )}
                <button className="primary compact" disabled={busy}>
                  {busy
                    ? t("Oppretter …", "Creating …")
                    : step === 2
                      ? t("Opprett bruker", "Create user")
                      : t("Neste", "Next")}
                </button>
              </div>
            </form>
          )}
        </SettingsDialog>
      )}
    </section>
  );
}
export function AccountAvatar({ name }: { name: string }) {
  const [failed, setFailed] = useState(false);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const refresh = () => {
      setFailed(false);
      setVersion((v) => v + 1);
    };
    window.addEventListener("smarti-profile-photo", refresh);
    return () => window.removeEventListener("smarti-profile-photo", refresh);
  }, []);
  return (
    <div className="account-avatar">
      {failed ? (
        name[0].toUpperCase()
      ) : (
        <img
          src={`api/account/photo?v=${version}`}
          alt=""
          onError={() => setFailed(true)}
        />
      )}
    </div>
  );
}
