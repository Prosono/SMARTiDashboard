import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, MapPin } from "lucide-react";
import { api } from "./api";
import { SettingsDialog } from "./home/SettingsDialog";
export type PairedDevice = { id?: string; name?: string; provider: string };
export function PairingFinish({
  session,
  lang,
  done,
  close,
}: {
  session: {
    id: string;
    provider: string;
    device_id?: string;
    device_name?: string;
  };
  lang: string;
  done: (d: PairedDevice) => void;
  close: () => void;
}) {
  const no = lang !== "en",
    qc = useQueryClient();
  const [name, setName] = useState(session.device_name ?? "");
  const [area, setArea] = useState("");
  const [newRoom, setNewRoom] = useState("");
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const rooms = useQuery({
    queryKey: ["manage", "rooms"],
    queryFn: () =>
      api<{ areas: { area_id: string; name: string }[] }>("manage/rooms"),
  });
  const device = useQuery({
    queryKey: ["paired-device", session.id],
    queryFn: () =>
      api<{ ha_device_id?: string }>(
        `devices/${session.provider}/detail?device_id=${encodeURIComponent(session.device_id ?? "")}`,
      ),
    enabled: !!session.device_id,
    refetchInterval: (q) => (q.state.data?.ha_device_id ? false : 2000),
    retry: false,
  });
  const ready = !!device.data?.ha_device_id && !device.isError;
  async function save() {
    setBusy(true);
    setError("");
    try {
      const result = await api<PairedDevice>(
        `setup/sessions/${session.id}/finish`,
        "POST",
        { name: name.trim(), area_id: area },
      );
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["home"] }),
        qc.invalidateQueries({ queryKey: ["protocol-devices"] }),
        qc.invalidateQueries({ queryKey: ["manage"] }),
      ]);
      qc.setQueryData(["setup-session"], (old: object | null) =>
        old ? { ...old, setup_completed: true } : old,
      );
      done(result);
    } catch {
      setError(
        no
          ? "Kunne ikke bekrefte lagring. Navnet og rommet er beholdt her. Kontroller forbindelsen og prøv igjen."
          : "Could not confirm saving. Your name and room selection are preserved. Check the connection and retry.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <SettingsDialog
      lang={lang}
      title={
        no
          ? "Gi enheten et navn og et rom"
          : "Name your device and choose a room"
      }
      busy={busy}
      onClose={close}
    >
      <p>
        <CheckCircle2 size={19} />{" "}
        {no
          ? "Enheten er paret. Hvor skal den høre hjemme?"
          : "Device paired. Where does it belong?"}
      </p>
      {!ready && (
        <p role="status">
          {no
            ? "Venter på at hjemmesentralen registrerer enheten. Du kan fylle inn navn og rom mens du venter."
            : "Waiting for the controller to register the device. You can enter a name and room while waiting."}
        </p>
      )}
      {!ready && (
        <button onClick={() => void device.refetch()}>
          {no ? "Sjekk igjen" : "Check again"}
        </button>
      )}
      <form
        className="system-settings-form"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <label>
          {no ? "Enhetens navn" : "Device name"}
          <input
            autoFocus
            required
            maxLength={80}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={
              no
                ? "For eksempel Taklys stue"
                : "For example Living room ceiling light"
            }
          />
        </label>
        <label>
          <MapPin size={16} />
          {no ? "Rom / område" : "Room / area"}
          <select
            required
            value={area}
            onChange={(e) => setArea(e.target.value)}
          >
            <option value="">{no ? "Velg rom" : "Choose room"}</option>
            {rooms.data?.areas.map((r) => (
              <option key={r.area_id} value={r.area_id}>
                {r.name}
              </option>
            ))}
          </select>
        </label>
        {rooms.isError && (
          <p role="alert">
            {no ? "Kunne ikke hente rom." : "Could not load rooms."}
          </p>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={() => setCreating(!creating)}
        >
          {no ? "Opprett nytt rom" : "Create room"}
        </button>
        {creating && (
          <div>
            <label>
              {no ? "Nytt romnavn" : "New room name"}
              <input
                maxLength={80}
                value={newRoom}
                onChange={(e) => setNewRoom(e.target.value)}
              />
            </label>
            <button
              type="button"
              disabled={busy || !newRoom.trim()}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  const result = await api<{
                    areas: { area_id: string; name: string }[];
                  }>("manage/rooms", "POST", { name: newRoom.trim() });
                  qc.setQueryData(["manage", "rooms"], result);
                  const added = result.areas.find(
                    (r) => r.name === newRoom.trim(),
                  );
                  if (added) setArea(added.area_id);
                  setCreating(false);
                } catch {
                  setError(
                    no
                      ? "Kunne ikke bekrefte opprettelsen av rommet. Oppdater romlisten før du prøver igjen."
                      : "Could not confirm room creation. Refresh rooms before retrying.",
                  );
                  void rooms.refetch();
                } finally {
                  setBusy(false);
                }
              }}
            >
              {no ? "Lagre nytt rom" : "Save new room"}
            </button>
          </div>
        )}
        {error && <p role="alert">{error}</p>}
        <button
          className="primary"
          disabled={busy || !ready || !name.trim() || !area}
        >
          {busy
            ? no
              ? "Lagrer …"
              : "Saving …"
            : no
              ? "Lagre og vis enheten"
              : "Save and view device"}
        </button>
      </form>
    </SettingsDialog>
  );
}
