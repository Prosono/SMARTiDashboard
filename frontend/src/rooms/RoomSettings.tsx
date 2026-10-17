import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Star, Eye, Search } from "lucide-react";
import { api } from "../api";
import type { Home, Control } from "../types";
import { SettingsDialog } from "../home/SettingsDialog";

type Placements = {
  areas: Home["areas"];
  devices: {
    id: string;
    name: string;
    area_id: string | null;
    overrides: number;
  }[];
};
export function RoomSettings({
  home,
  room,
  name,
  controls,
  lang,
  admin,
  hidden,
  close,
  add,
}: {
  home: Home;
  room: string;
  name: string;
  controls: Control[];
  lang: string;
  admin: boolean;
  hidden?: string[];
  close: () => void;
  add: () => void;
}) {
  const t = (nb: string, en: string) => (lang === "en" ? en : nb);
  const qc = useQueryClient();
  const [tab, setTab] = useState("view"),
    [draft, setDraft] = useState(name),
    [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [failed, setFailed] = useState(false);
  const [candidate, setCandidate] = useState("");
  const placements = useQuery({
    queryKey: ["manage", "rooms"],
    queryFn: () => api<Placements>("manage/rooms"),
    enabled: admin && tab === "devices",
  });
  async function run(action: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true);
    setMessage("");
    setFailed(false);
    try {
      await action();
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["home"] }),
        qc.invalidateQueries({ queryKey: ["home-preferences"] }),
        qc.invalidateQueries({ queryKey: ["manage", "rooms"] }),
        qc.invalidateQueries({ queryKey: ["room-view", room] }),
      ]);
      setMessage(t("Endringen er lagret.", "Change saved."));
    } catch {
      setFailed(true);
      setMessage(
        t(
          "Kunne ikke bekrefte endringen. Kontroller forbindelsen og prøv igjen.",
          "Could not confirm the change. Check the connection and retry.",
        ),
      );
    } finally {
      setBusy(false);
    }
  }
  const selected = placements.data?.devices.find((d) => d.id === candidate);
  return (
    <SettingsDialog
      title={`${t("Administrer rom", "Manage room")} · ${name}`}
      lang={lang}
      busy={busy}
      onClose={close}
    >
      <div className="room-settings">
        <nav aria-label={t("Rominnstillinger", "Room settings")}>
          {[
            ["view", t("Favoritter og synlighet", "Favorites & visibility")],
            ["name", t("Romnavn", "Room name")],
            ["images", t("Bilde eller ikon", "Image or icon")],
            ["devices", t("Legg til enheter", "Add devices")],
          ]
            .filter(([id]) => admin || id === "view")
            .map(([id, label]) => (
              <button
                key={id}
                aria-pressed={tab === id}
                onClick={() => {
                  setTab(id);
                  setMessage("");
                }}
              >
                {label}
              </button>
            ))}
        </nav>
        {message && <p role={failed ? "alert" : "status"}>{message}</p>}
        {tab === "images" && (
          <section className="room-image-library">
            <h3>
              {t("Et bilde som passer rommet", "A picture for your room")}
            </h3>
            <p>
              {t(
                "Velg et bilde fra SMARTi-biblioteket, eller last opp ditt eget. Bildet gjelder hele hjemmet.",
                "Choose an image from the SMARTi library or upload your own. The picture is shared across the home.",
              )}
            </p>
            <h3>{t("Velg et romikon", "Choose a room icon")}</h3>
            <div className="room-icon-grid">
              {[
                ["living", "Stue", "Living room"],
                ["bedroom", "Soverom", "Bedroom"],
                ["kitchen", "Kjøkken", "Kitchen"],
                ["bathroom", "Bad", "Bathroom"],
                ["attic", "Loft", "Attic"],
                ["basement", "Kjeller", "Basement"],
                ["garage", "Garasje", "Garage"],
                ["outdoor", "Uteområde", "Outdoor"],
                ["storage", "Bod", "Storage"],
                ["laundry", "Vaskerom", "Laundry"],
                ["office", "Kontor", "Office"],
                ["hallway", "Gang", "Hallway"],
              ].map(([id, nb, en]) => (
                <button
                  key={id}
                  disabled={busy || !room}
                  onClick={() =>
                    void run(() =>
                      api(
                        `home/room-image/${encodeURIComponent(room)}`,
                        "PUT",
                        { icon: id },
                      ),
                    )
                  }
                >
                  <img src={`./room-icons/${id}.svg`} alt="" />
                  <span>{t(nb, en)}</span>
                </button>
              ))}
            </div>
            <h3>{t("Eller velg et bilde", "Or choose an image")}</h3>
            <div className="room-image-grid">
              {[
                ["living", "Stue", "Living room"],
                ["bedroom", "Soverom", "Bedroom"],
                ["kitchen", "Kjøkken", "Kitchen"],
                ["bathroom", "Bad", "Bathroom"],
                ["attic", "Loft", "Attic"],
                ["basement", "Kjeller", "Basement"],
                ["garage", "Garasje", "Garage"],
                ["outdoor", "Uteområde", "Outdoor area"],
                ["storage", "Bod", "Storage room"],
                ["laundry", "Vaskerom", "Laundry room"],
                ["office", "Kontor", "Office"],
                ["hallway", "Gang", "Hallway"],
              ].map(([id, nb, en]) => (
                <button
                  key={id}
                  disabled={busy || !room}
                  onClick={() =>
                    void run(() =>
                      api(
                        `home/room-image/${encodeURIComponent(room)}`,
                        "PUT",
                        { bank: id },
                      ),
                    )
                  }
                >
                  <img src={`./home/home-${id}.webp`} alt="" loading="lazy" />
                  <span>{t(nb, en)}</span>
                </button>
              ))}
            </div>
            <label>
              {t("Last opp eget bilde", "Upload your own image")}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                disabled={busy || !room}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (!file) return;
                  void run(async () => {
                    if (
                      !/^image\/(jpeg|png|webp)$/.test(file.type) ||
                      file.size > 15000000
                    )
                      throw new Error("image");
                    const image = await createImageBitmap(file);
                    const scale = Math.min(
                      1,
                      1400 / Math.max(image.width, image.height),
                    );
                    const canvas = document.createElement("canvas");
                    canvas.width = Math.round(image.width * scale);
                    canvas.height = Math.round(image.height * scale);
                    canvas
                      .getContext("2d")!
                      .drawImage(image, 0, 0, canvas.width, canvas.height);
                    image.close();
                    await api(
                      `home/room-image/${encodeURIComponent(room)}`,
                      "PUT",
                      {
                        data: canvas
                          .toDataURL("image/jpeg", 0.78)
                          .split(",")[1],
                      },
                    );
                  });
                }}
              />
            </label>
            <button
              disabled={busy || !room}
              onClick={() =>
                void run(() =>
                  api(`home/room-image/${encodeURIComponent(room)}`, "PUT", {
                    data: "",
                  }),
                )
              }
            >
              {t("Bruk automatisk rombilde", "Use automatic room image")}
            </button>
          </section>
        )}
        {tab === "name" && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run(() =>
                api(`manage/rooms/${encodeURIComponent(room)}`, "PUT", {
                  name: draft.trim(),
                }),
              );
            }}
          >
            <label>
              {t("Romnavn", "Room name")}
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                required
                maxLength={80}
              />
            </label>
            <button
              className="primary compact"
              disabled={busy || !room || !draft.trim()}
            >
              {t("Lagre navn", "Save name")}
            </button>
          </form>
        )}
        {tab === "view" && (
          <>
            <p className="muted">
              {t(
                "Favoritter vises også på Hjem. Synlighet gjelder bare din romvisning; enheter og sikkerhetsvarsler fortsetter å fungere.",
                "Favorites also appear on Home. Visibility only affects your room view; devices and safety alerts keep working.",
              )}
            </p>
            <label className="room-settings-search">
              <Search size={18} />
              <input
                aria-label={t("Finn kontroll", "Find control")}
                placeholder={t(
                  "Søk etter lys, sensor …",
                  "Search lights, sensors …",
                )}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            {hidden === undefined && room && (
              <p role="status">
                {t(
                  "Synlighetsvalg er ikke tilgjengelige ennå.",
                  "Visibility settings are not available yet.",
                )}
              </p>
            )}
            <div className="room-settings-controls">
              {controls
                .filter((c) =>
                  c.name
                    .toLocaleLowerCase()
                    .includes(search.toLocaleLowerCase()),
                )
                .map((c) => (
                  <div key={c.entity_id}>
                    <strong>{c.name}</strong>
                    <div>
                      <label>
                        <Star size={16} />
                        <input
                          type="checkbox"
                          aria-label={`${t("Favoritt", "Favorite")}: ${c.name}`}
                          checked={home.favorites.includes(c.entity_id)}
                          disabled={busy}
                          onChange={() =>
                            void run(() =>
                              api(
                                `favorites/${encodeURIComponent(c.entity_id)}`,
                                "PUT",
                              ),
                            )
                          }
                        />
                        {t("Favoritt", "Favorite")}
                      </label>
                      <label>
                        <Eye size={16} />
                        <input
                          type="checkbox"
                          aria-label={`${t("Vis i rommet", "Show in room")}: ${c.name}`}
                          checked={!hidden?.includes(c.entity_id)}
                          disabled={busy || !room || hidden === undefined}
                          onChange={(e) => {
                            const next = e.target.checked
                              ? hidden!.filter((id) => id !== c.entity_id)
                              : [...hidden!, c.entity_id];
                            void run(() =>
                              api(
                                `home/room-view/${encodeURIComponent(room)}`,
                                "PUT",
                                {
                                  hidden: next.filter((id) =>
                                    controls.some((c) => c.entity_id === id),
                                  ),
                                },
                              ),
                            );
                          }}
                        />
                        {t("Vis", "Show")}
                      </label>
                    </div>
                  </div>
                ))}
            </div>
            {!controls.length && (
              <p>
                {t(
                  "Ingen kontroller i dette rommet ennå.",
                  "No controls in this room yet.",
                )}
              </p>
            )}
          </>
        )}
        {tab === "devices" && (
          <>
            <button className="primary compact" disabled={busy} onClick={add}>
              <Plus size={18} />
              {t("Koble til en ny enhet", "Pair a new device")}
            </button>
            <p className="muted">
              {t(
                "Etter paring velger du navn og rom i veiviseren.",
                "After pairing, choose the name and room in the wizard.",
              )}
            </p>
            <h3>
              {t(
                "Legg en eksisterende enhet i rommet",
                "Assign an existing device",
              )}
            </h3>
            {placements.isError && (
              <p role="alert">
                {t("Kunne ikke hente enheter.", "Could not load devices.")}{" "}
                <button onClick={() => void placements.refetch()}>
                  {t("Prøv igjen", "Retry")}
                </button>
              </p>
            )}
            <label>
              {t("Velg enhet", "Choose device")}
              <select
                value={candidate}
                disabled={busy || !placements.data}
                onChange={(e) => setCandidate(e.target.value)}
              >
                <option value="">{t("Velg enhet …", "Choose device …")}</option>
                {placements.data?.devices
                  .filter((d) => d.area_id !== room)
                  .map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} ·{" "}
                      {placements.data.areas.find(
                        (a) => a.area_id === d.area_id,
                      )?.name || t("Uten rom", "Unassigned")}
                    </option>
                  ))}
              </select>
            </label>
            {selected?.area_id && (
              <p>
                {t("Enheten flyttes fra", "This device moves from")}{" "}
                {
                  placements.data?.areas.find(
                    (a) => a.area_id === selected.area_id,
                  )?.name
                }{" "}
                {t("til", "to")} {name}.{" "}
                {t("Gjelder hele hjemmet.", "Applies to the whole home.")}
              </p>
            )}
            {!!selected?.overrides && (
              <p>
                {t(
                  "Noen kontroller har egne romvalg og følger ikke automatisk med.",
                  "Some controls have their own room assignments and do not move automatically.",
                )}
              </p>
            )}
            <button
              disabled={busy || !selected || !room}
              onClick={() =>
                void run(async () => {
                  await api(
                    `manage/placements/device/${encodeURIComponent(candidate)}`,
                    "PUT",
                    { area_id: room },
                  );
                  setCandidate("");
                })
              }
            >
              {t("Legg i dette rommet", "Assign to this room")}
            </button>
          </>
        )}
      </div>
    </SettingsDialog>
  );
}
