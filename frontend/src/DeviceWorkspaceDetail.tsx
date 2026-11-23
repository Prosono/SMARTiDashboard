import { useId, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  ChevronRight,
  Eye,
  EyeOff,
  House,
  Pencil,
} from "lucide-react";
import { api, ApiError } from "./api";
import {
  deviceWorkspaceRoom,
  deviceWorkspaceRoomId,
  deviceWorkspaceStatus,
} from "./deviceWorkspaceModel";
import { DeviceArtwork } from "./home/DeviceArtwork";
import { SettingsDialog } from "./home/SettingsDialog";
import type { Control, Home } from "./types";
import "./deviceWorkspaceDetail.css";

type Props = {
  control: Control | null;
  home: Home;
  lang: string;
  admin: boolean;
  offline: boolean;
  openControl: (control: Control) => void;
  mobileOpen: boolean;
  close: () => void;
};

type Editor = "room" | "name" | "visibility";
const maxName = 80;

export function DeviceWorkspaceDetail({ control, ...props }: Props) {
  if (control) {
    return <SelectedDevice key={control.id} control={control} {...props} />;
  }
  return (
    <aside className="device-workspace-detail device-workspace-detail-empty">
      <h2>{props.lang === "en" ? "Device details" : "Enhetsdetaljer"}</h2>
      <p>
        {props.lang === "en"
          ? "Choose a control to see its details."
          : "Velg en kontroll for å se detaljer."}
      </p>
    </aside>
  );
}

function SelectedDevice({
  control,
  home,
  lang,
  admin,
  offline,
  openControl,
  mobileOpen,
  close,
}: Omit<Props, "control"> & { control: Control }) {
  const t = (nb: string, en: string) => (lang === "en" ? en : nb);
  const query = useQueryClient();
  const heading = useId();
  const formId = useId();
  const [editor, setEditor] = useState<Editor | null>(null);
  const [name, setName] = useState("");
  const [area, setArea] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const status = deviceWorkspaceStatus(control, lang, offline);
  const room = deviceWorkspaceRoom(control, home, lang);
  const areaId = deviceWorkspaceRoomId(control, home);
  const deviceArea = home.devices.find(
    ({ id }) => id === control.device_id,
  )?.area_id;
  const deviceRoom = home.areas.find(
    ({ area_id }) => area_id === deviceArea,
  )?.name;
  const original = control.attributes.smarti_original_name;
  const hasCustomName =
    typeof original === "string" && original !== control.name;
  const hidden = control.attributes.smarti_hidden === true;
  const entity = encodeURIComponent(control.entity_id);
  const visibilityLabel = hidden
    ? t("Vis i oversikten", "Show in overview")
    : t("Skjul fra oversikten", "Hide from overview");
  const disabled = offline || busy;
  const actions = [
    { id: "room", label: t("Endre rom", "Change room"), Icon: House },
    { id: "name", label: t("Gi nytt navn", "Rename"), Icon: Pencil },
    { id: "visibility", label: visibilityLabel, Icon: hidden ? Eye : EyeOff },
  ] as const;

  function selectEditor(next: Editor) {
    setError("");
    setMessage("");
    setEditor(editor === next ? null : next);
    if (next === "name") setName(control.name);
    if (next === "room") setArea(areaId);
  }

  function closeSheet() {
    setEditor(null);
    setError("");
    setMessage("");
    close();
  }

  async function apply(next: Editor, value: string) {
    if (disabled || !admin) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (next === "room") {
        await api(`manage/placements/entity/${entity}`, "PUT", {
          area_id: value || null,
        });
        await query.invalidateQueries({ queryKey: ["manage", "rooms"] });
        setMessage(t("Rommet er oppdatert.", "Room updated."));
      } else if (next === "name") {
        await api(`controls/${entity}/appearance`, "PATCH", { name: value });
        setMessage(t("Navnet er oppdatert.", "Name updated."));
      } else {
        await api(`controls/${entity}/visibility`, "PUT", { hidden: !hidden });
        await query.invalidateQueries({ queryKey: ["control-visibility"] });
        if (mobileOpen) closeSheet();
      }
      await query.invalidateQueries({ queryKey: ["home"] });
      setEditor(null);
    } catch (failure) {
      setError(
        next === "room" && failure instanceof ApiError && failure.status === 404
          ? t(
              "Fant ikke den registrerte kontrollen eller rommet. Last inn enhetslisten på nytt før du prøver igjen.",
              "The registered control or room couldn't be found. Reload the device list before trying again.",
            )
          : t(
              "Endringen kunne ikke bekreftes. Kontroller status før du prøver igjen.",
              "The change could not be confirmed. Check the status before trying again.",
            ),
      );
    } finally {
      setBusy(false);
    }
  }

  const trimmed = name.trim();
  const body = (
    <div className="device-workspace-detail-content">
      <div className="device-workspace-detail-hero">
        <div className="device-workspace-detail-art">
          <DeviceArtwork c={control} available={!offline} />
        </div>
        <div className="device-workspace-detail-text">
          <h2 id={heading} aria-hidden={mobileOpen || undefined}>
            {control.name}
          </h2>
          <span className="device-workspace-detail-room">{room}</span>
          <span
            className="device-workspace-detail-status"
            data-tone={status.tone}
          >
            {status.label}
          </span>
        </div>
      </div>
      <button
        type="button"
        className="primary device-workspace-detail-open"
        aria-haspopup="dialog"
        disabled={busy}
        onClick={() => {
          if (mobileOpen) closeSheet();
          openControl(control);
        }}
      >
        {t("Åpne kontroll", "Open control")}
        <ArrowRight size={18} aria-hidden="true" />
      </button>
      {admin && (
        <div className="device-workspace-detail-actions">
          {actions.map(({ id, label, Icon }) => (
            <div className="device-workspace-detail-action" key={id}>
              <button
                type="button"
                aria-expanded={editor === id}
                aria-controls={editor === id ? formId : undefined}
                disabled={disabled}
                onClick={() => selectEditor(id)}
              >
                <Icon size={19} aria-hidden="true" />
                <span>{label}</span>
                <ChevronRight size={16} aria-hidden="true" />
              </button>
              {editor === id && (
                <form
                  id={formId}
                  className="device-workspace-detail-editor"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void apply(id, id === "room" ? area : trimmed);
                  }}
                >
                  {id === "room" ? (
                    <label>
                      <span>{t("Rom", "Room")}</span>
                      <select
                        value={area}
                        disabled={disabled}
                        onChange={(event) => setArea(event.target.value)}
                      >
                        <option value="">
                          {deviceRoom
                            ? t(
                                `Bruk enhetens rom (${deviceRoom})`,
                                `Use device room (${deviceRoom})`,
                              )
                            : t("Ufordelt", "Unassigned")}
                        </option>
                        {home.areas.map(({ area_id, name: label }) => (
                          <option key={area_id} value={area_id}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : id === "name" ? (
                    <label>
                      <span>{t("Navn", "Name")}</span>
                      <input
                        maxLength={maxName}
                        value={name}
                        disabled={disabled}
                        onChange={(event) => setName(event.target.value)}
                      />
                    </label>
                  ) : (
                    <p>
                      {hidden
                        ? t(
                            "Kontrollen vises igjen i hjemmets oversikter.",
                            "The control will appear in the home overviews.",
                          )
                        : t(
                            "Du finner kontrollen igjen under Skjulte enheter.",
                            "Find the control again under Hidden devices.",
                          )}
                    </p>
                  )}
                  <div className="device-workspace-detail-editor-buttons">
                    {id === "name" && hasCustomName && (
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() => void apply("name", "")}
                      >
                        {t("Bruk opprinnelig navn", "Use original name")}
                      </button>
                    )}
                    <button
                      type="submit"
                      className="primary"
                      disabled={
                        disabled ||
                        (id === "room" && area === areaId) ||
                        (id === "name" &&
                          (!trimmed ||
                            trimmed === control.name ||
                            trimmed.length > maxName))
                      }
                    >
                      {busy
                        ? t("Lagrer …", "Saving …")
                        : id === "visibility"
                          ? hidden
                            ? t("Vis kontroll", "Show control")
                            : t("Skjul kontroll", "Hide control")
                          : t("Lagre", "Save")}
                    </button>
                  </div>
                </form>
              )}
            </div>
          ))}
        </div>
      )}
      {message && (
        <p className="device-workspace-detail-feedback" role="status">
          {message}
        </p>
      )}
      {error && (
        <p className="device-workspace-detail-feedback" role="alert">
          {error}
        </p>
      )}
    </div>
  );

  return mobileOpen ? (
    <SettingsDialog
      title={control.name}
      lang={lang}
      busy={busy}
      compact
      presentation="device"
      onClose={closeSheet}
    >
      {body}
    </SettingsDialog>
  ) : (
    <aside className="device-workspace-detail" aria-labelledby={heading}>
      {body}
    </aside>
  );
}
