import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, ArrowLeft, Trash2, DoorOpen } from "lucide-react";
import { api } from "../api";
import { Feedback, LoadError, useWork, words } from "./shared";
type Rooms = {
  areas: { area_id: string; name: string }[];
  devices: {
    id: string;
    name: string;
    area_id: string | null;
    overrides: number;
  }[];
  entities: {
    entity_id: string;
    name: string;
    device_id: string | null;
    area_id: string | null;
  }[];
};
export function RoomManager({
  lang,
  back,
}: {
  lang: string;
  back: () => void;
}) {
  const t = (nb: string, en: string) => words(lang, nb, en);
  const q = useQuery({
    queryKey: ["manage", "rooms"],
    queryFn: () => api<Rooms>("manage/rooms"),
  });
  const [selected, select] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [search, setSearch] = useState("");
  const [confirm, setConfirm] = useState(false);
  const w = useWork(lang);
  const room = q.data?.areas.find((a) => a.area_id === selected);
  function choose(id: string | null) {
    select(id);
    setName(q.data?.areas.find((a) => a.area_id === id)?.name || "");
    setConfirm(false);
  }
  function placement(kind: string, id: string, area: string) {
    void w.run(() =>
      api(`manage/placements/${kind}/${encodeURIComponent(id)}`, "PUT", {
        area_id: area || null,
      }),
    );
  }
  return (
    <section className="management-page">
      <button className="text-button" onClick={back}>
        <ArrowLeft size={18} />
        {t("Tilbake til rom", "Back to rooms")}
      </button>
      <div className="page-heading">
        <span className="eyebrow">
          {t("Hjemmets inndeling", "Your home, organized")}
        </span>
        <h1>{t("Plass til alt.", "A place for everything.")}</h1>
        <p>
          {t(
            "Gi rommene navn, og legg enhetene der de hører hjemme.",
            "Name your rooms and put devices where they belong.",
          )}
        </p>
      </div>
      <Feedback message={w.message} />
      {q.isError && <LoadError lang={lang} retry={() => void q.refetch()} />}
      {q.isPending && (
        <p role="status">{t("Henter rom …", "Loading rooms …")}</p>
      )}
      {q.data && (
        <div className="management-split">
          <nav
            className="management-index"
            aria-label={t("Velg rom", "Choose room")}
          >
            {q.data.areas.map((a) => (
              <button
                key={a.area_id}
                className={selected === a.area_id ? "chosen" : ""}
                onClick={() => choose(a.area_id)}
              >
                <DoorOpen size={19} />
                <span>{a.name}</span>
                <small>
                  {q.data.devices.filter((d) => d.area_id === a.area_id).length}
                </small>
              </button>
            ))}
            <button
              className={!selected ? "chosen" : ""}
              onClick={() => choose(null)}
            >
              <Plus size={19} />
              {t("Nytt rom", "New room")}
            </button>
          </nav>
          <div className="management-editor">
            <form
              className="inline-form"
              onSubmit={(e) => {
                e.preventDefault();
                void w.run(async () => {
                  const result = await api<Rooms>(
                    room
                      ? `manage/rooms/${encodeURIComponent(room.area_id)}`
                      : "manage/rooms",
                    room ? "PUT" : "POST",
                    { name },
                  );
                  if (!room)
                    select(
                      result.areas.find((a) => a.name === name.trim())
                        ?.area_id || null,
                    );
                });
              }}
            >
              <label>
                {t("Romnavn", "Room name")}
                <input
                  required
                  maxLength={80}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <button
                className="primary compact"
                disabled={w.busy || !name.trim()}
              >
                {room
                  ? t("Lagre navn", "Save name")
                  : t("Opprett rom", "Create room")}
              </button>
            </form>
            {room && (
              <>
                <div className="section-heading">
                  <h2>{t("Enheter og plassering", "Devices and placement")}</h2>
                  <span className="muted">{room.name}</span>
                </div>
                <p className="muted">
                  {t(
                    "Velg rom for hver enhet. Endringen gjelder hele hjemmet.",
                    "Choose a room for each device. Changes apply to the entire home.",
                  )}
                </p>
                <input
                  className="wide-input"
                  aria-label={t("Søk etter enhet", "Search devices")}
                  placeholder={t("Søk etter enhet …", "Search devices …")}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <div className="management-rows">
                  {q.data.devices
                    .filter((d) =>
                      d.name.toLowerCase().includes(search.toLowerCase()),
                    )
                    .map((d) => (
                      <div className="management-row" key={d.id}>
                        <div>
                          <strong>{d.name}</strong>
                          {d.overrides > 0 && (
                            <small>
                              {t(
                                `${d.overrides} egne romvalg for entiteter`,
                                `${d.overrides} entity room overrides`,
                              )}
                            </small>
                          )}
                        </div>
                        <label>
                          <span className="sr-only">
                            {t("Rom for ", "Room for ")}
                            {d.name}
                          </span>
                          <select
                            aria-label={t("Rom for ", "Room for ") + d.name}
                            disabled={w.busy}
                            value={d.area_id || ""}
                            onChange={(e) =>
                              placement("device", d.id, e.target.value)
                            }
                          >
                            <option value="">
                              {t("Uten rom", "Unassigned")}
                            </option>
                            {q.data!.areas.map((a) => (
                              <option key={a.area_id} value={a.area_id}>
                                {a.name}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                    ))}
                </div>
                <details className="advanced-editor">
                  <summary>
                    {t(
                      "Egne romvalg for sensorer og kontroller",
                      "Room overrides for sensors and controls",
                    )}
                  </summary>
                  <p>
                    {t(
                      "En entitet med eget rom følger ikke enhetens rom. Velg «Følg enhet» for å fjerne overstyringen.",
                      "An entity override takes precedence over the device room. Choose ‘Follow device’ to remove it.",
                    )}
                  </p>
                  {q.data.entities
                    .filter((e) =>
                      `${e.name} ${e.entity_id}`
                        .toLowerCase()
                        .includes(search.toLowerCase()),
                    )
                    .map((e) => (
                      <div className="management-row" key={e.entity_id}>
                        <span>{e.name}</span>
                        <select
                          aria-label={e.entity_id}
                          disabled={w.busy}
                          value={e.area_id || ""}
                          onChange={(v) =>
                            placement("entity", e.entity_id, v.target.value)
                          }
                        >
                          <option value="">
                            {e.device_id
                              ? t("Følg enhet", "Follow device")
                              : t("Uten rom", "Unassigned")}
                          </option>
                          {q.data!.areas.map((a) => (
                            <option key={a.area_id} value={a.area_id}>
                              {a.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    ))}
                </details>
                <div className="danger-zone">
                  {confirm ? (
                    <>
                      <p>
                        {t(
                          "Slette rommet? Enhetene beholdes, men mister denne romtilordningen.",
                          "Delete this room? Devices remain, but lose this room assignment.",
                        )}
                      </p>
                      <button
                        disabled={w.busy}
                        onClick={() =>
                          void w.run(
                            () =>
                              api(
                                `manage/rooms/${encodeURIComponent(room.area_id)}`,
                                "DELETE",
                              ),
                            () => choose(null),
                          )
                        }
                      >
                        {t("Ja, slett rom", "Yes, delete room")}
                      </button>
                      <button onClick={() => setConfirm(false)}>
                        {t("Avbryt", "Cancel")}
                      </button>
                    </>
                  ) : (
                    <button
                      className="text-button"
                      onClick={() => setConfirm(true)}
                    >
                      <Trash2 size={16} />
                      {t("Slett rom", "Delete room")}
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
