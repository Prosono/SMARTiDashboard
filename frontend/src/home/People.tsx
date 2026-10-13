import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Users, Settings2 } from "lucide-react";
import { api } from "../api";
import type { Home } from "../types";
import { usable } from "./homeModel";
import "./extras.css";
type Pref = {
  people: string[] | null;
  only_home: boolean;
  photos: Record<string, { custom: boolean; available: boolean }>;
};
function Avatar({
  id,
  name,
  version,
  available,
}: {
  id: string;
  name: string;
  version: number;
  available: boolean;
}) {
  const [failed, setFailed] = useState("");
  const url = new URL(
    `api/home/people/${encodeURIComponent(id)}/photo?v=${version}`,
    document.baseURI,
  ).href;
  return (
    <span className="person-avatar" aria-hidden="true">
      {available && failed !== url ? (
        <img src={url} alt="" onError={() => setFailed(url)} />
      ) : (
        name.slice(0, 1).toLocaleUpperCase()
      )}
    </span>
  );
}
export function Presence({
  home,
  offline,
  lang,
  admin,
}: {
  home: Home;
  offline: boolean;
  lang: string;
  admin: boolean;
}) {
  const en = lang === "en",
    t = (nb: string, english: string) => (en ? english : nb),
    qc = useQueryClient();
  const q = useQuery({
    queryKey: ["people-preferences"],
    queryFn: () => api<Pref>("home/people"),
  });
  const people = home.controls.filter(
    (c) => c.domain === "person" && !c.diagnostic,
  );
  const [editing, edit] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [pendingPref, setPendingPref] = useState<Pref | null>(null);
  const pref = pendingPref ?? q.data;
  async function savePreferences(value: Pick<Pref, "people" | "only_home">) {
    if (!pref || busy) return;
    setBusy(true);
    setError("");
    void qc.cancelQueries({ queryKey: ["people-preferences"] });
    setPendingPref({ ...pref, ...value });
    qc.setQueryData<Pref>(["people-preferences"], { ...pref, ...value });
    try {
      await api("home/people", "PUT", value);
    } catch {
      qc.setQueryData(["people-preferences"], pref);
      setError(
        t("Kunne ikke lagre. Prøv igjen.", "Could not save. Try again."),
      );
    } finally {
      setPendingPref(null);
      setBusy(false);
    }
  }
  async function save(work: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await work();
      await qc.invalidateQueries({ queryKey: ["people-preferences"] });
    } catch {
      setError(
        t("Kunne ikke lagre. Prøv igjen.", "Could not save. Try again."),
      );
    } finally {
      setBusy(false);
    }
  }
  async function upload(id: string, file: File) {
    await save(async () => {
      if (
        !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
        file.size > 10000000
      )
        throw Error("image");
      const img = await createImageBitmap(file);
      const size = Math.min(512, img.width, img.height);
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = size;
      const crop = Math.min(img.width, img.height);
      canvas
        .getContext("2d")!
        .drawImage(
          img,
          (img.width - crop) / 2,
          (img.height - crop) / 2,
          crop,
          crop,
          0,
          0,
          size,
          size,
        );
      img.close();
      await api(`home/people/${encodeURIComponent(id)}/photo`, "PUT", {
        data: canvas.toDataURL("image/jpeg", 0.85).split(",")[1],
      });
    });
  }
  const shown = (pref ? people : []).filter(
    (c) =>
      (!pref || pref.people === null || pref.people.includes(c.entity_id)) &&
      (!pref?.only_home || offline || !usable(c) || c.state === "home"),
  );
  return (
    <section
      className="home-presence"
      aria-label={t("Hvem er hjemme", "Who's home")}
    >
      <div className="people-heading">
        <Users size={20} />
        <h2>{t("Hvem er hjemme", "Who's home")}</h2>
        <button onClick={() => edit(!editing)} aria-expanded={editing}>
          <Settings2 size={16} />
          {t("Velg personer", "Choose people")}
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
      {q.isError && (
        <p role="alert">
          {t(
            "Personvalg kunne ikke lastes.",
            "Could not load people preferences.",
          )}{" "}
          <button onClick={() => q.refetch()}>
            {t("Prøv igjen", "Retry")}
          </button>
        </p>
      )}
      {editing && (
        <fieldset className="people-settings" disabled={busy || !pref}>
          <legend>
            {t("Personer på din Hjem-side", "People on your Home page")}
          </legend>
          <p>
            {t(
              "Dette velger hvem du ser her. Tilstedeværelsen kommer fra hjemmesentralen. Ukjent status beholdes synlig.",
              "Choose who appears here. Presence comes from the home hub. Unknown states remain visible.",
            )}
          </p>
          <label>
            <input
              type="checkbox"
              checked={!!pref?.only_home}
              onChange={(e) =>
                void savePreferences({
                  people: pref?.people ?? null,
                  only_home: e.target.checked,
                })
              }
            />
            {t("Vis bare de som er hjemme", "Show only people at home")}
          </label>
          <button
            onClick={() =>
              void savePreferences({
                people: null,
                only_home: pref?.only_home ?? false,
              })
            }
          >
            {t("Vis alle personer", "Show all people")}
          </button>
          {people.map((c) => (
            <div className="person-setting" key={c.entity_id}>
              <label>
                <input
                  type="checkbox"
                  checked={
                    pref?.people === null ||
                    !!pref?.people.includes(c.entity_id)
                  }
                  onChange={() => {
                    const selected =
                      pref?.people ?? people.map((p) => p.entity_id);
                    void savePreferences({
                      people: selected.includes(c.entity_id)
                        ? selected.filter((id) => id !== c.entity_id)
                        : [...selected, c.entity_id],
                      only_home: pref?.only_home ?? false,
                    });
                  }}
                />
                {c.name}
              </label>
              {admin && (
                <div>
                  <label className="person-upload">
                    {t("Velg profilbilde", "Choose profile photo")}
                    <input
                      aria-label={`${t("Profilbilde", "Profile photo")}: ${c.name}`}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={(e) => {
                        if (e.target.files?.[0])
                          void upload(c.entity_id, e.target.files[0]);
                        e.target.value = "";
                      }}
                    />
                  </label>
                  {pref?.photos[c.entity_id]?.custom && (
                    <button
                      onClick={() =>
                        void save(() =>
                          api(
                            `home/people/${encodeURIComponent(c.entity_id)}/photo`,
                            "PUT",
                            { data: "" },
                          ),
                        )
                      }
                    >
                      {t("Bruk systembildet", "Use system photo")}
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
          {admin && (
            <small>
              {t(
                "Bilder deles med hjemmet. Velg et bilde under 10 MB; det beskjæres til et kvadrat.",
                "Photos are shared with the home. Choose an image under 10 MB; it is cropped to a square.",
              )}
            </small>
          )}
        </fieldset>
      )}
      {shown.length ? (
        <ul>
          {shown.map((c) => {
            const unknown = offline || !usable(c),
              here = !unknown && c.state === "home";
            return (
              <li key={c.id} className={here ? "person-home" : "person-away"}>
                <Avatar
                  id={c.entity_id}
                  name={c.name}
                  version={q.dataUpdatedAt}
                  available={!!pref?.photos[c.entity_id]?.available}
                />
                <span>
                  <strong>{c.name}</strong>
                  <small>
                    {unknown
                      ? t("Ukjent", "Unknown")
                      : here
                        ? t("Hjemme", "Home")
                        : t("Borte", "Away")}
                  </small>
                </span>
                <span className="person-dot" aria-hidden="true" />
              </li>
            );
          })}
        </ul>
      ) : (
        <p>
          {q.isPending
            ? t("Henter personvalg…", "Loading people preferences…")
            : !people.length
              ? t(
                  "Ingen personer er tilgjengelige fra hjemmesentralen ennå.",
                  "No people are available from the home hub yet.",
                )
              : pref?.people?.length === 0
                ? t("Ingen personer valgt.", "No people selected.")
                : t(
                    "Ingen av de valgte personene er hjemme.",
                    "None of the selected people are home.",
                  )}
        </p>
      )}
      {offline && (
        <small>
          {t(
            "Venter på ferske tilstedeværelsesdata.",
            "Waiting for fresh presence data.",
          )}
        </small>
      )}
    </section>
  );
}
