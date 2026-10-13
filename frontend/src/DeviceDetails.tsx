import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { X, Radio } from "lucide-react";
import { api } from "./api";
import type { Control } from "./types";

export function DevicePicture({
  url,
  name,
}: {
  url?: string | null;
  name: string;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [url]);
  return url && !failed ? (
    <img
      className="device-picture"
      src={new URL(url, document.baseURI).href}
      alt={name}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  ) : (
    <Radio aria-label={name} size={30} />
  );
}
type Detail = {
  name: string;
  model?: string;
  manufacturer?: string;
  area?: string;
  firmware?: string;
  hardware?: string;
  description?: string;
  power_source?: string;
  interview_state?: string;
  status: string;
  network_status: string;
  id: string;
  node_id?: number;
  lqi?: number;
  sample_at?: number | null;
  network_address?: number;
  secure?: boolean;
  image_url?: string;
  custom_image?: boolean;
  removable?: boolean;
  controls: Control[];
};
export function DeviceDetails({
  provider,
  id,
  name,
  lang,
  admin,
  close,
  remove,
}: {
  provider: string;
  id: string;
  name: string;
  lang: string;
  admin: boolean;
  close: () => void;
  remove: () => void;
}) {
  const no = lang !== "en";
  const dialog = useRef<HTMLDialogElement>(null);
  const qc = useQueryClient();
  const [imageBusy, setImageBusy] = useState(false);
  const [error, setError] = useState("");
  const detail = useQuery({
    queryKey: ["device-detail", provider, id],
    queryFn: () =>
      api<Detail>(
        `devices/${provider}/detail?device_id=${encodeURIComponent(id)}`,
      ),
    refetchInterval: 5000,
    retry: false,
  });
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  const d = detail.data;
  async function image(file?: File) {
    if (
      file &&
      (!["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
        file.size > 600000)
    ) {
      setError(
        no
          ? "Velg PNG, JPEG eller WebP under 600 kB."
          : "Choose PNG, JPEG or WebP under 600 kB.",
      );
      return;
    }
    setImageBusy(true);
    setError("");
    try {
      const data = file
        ? await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result));
            reader.onerror = reject;
            reader.readAsDataURL(file);
          })
        : null;
      await api(`devices/${provider}/image`, "PUT", {
        device_id: id,
        image: data,
      });
      await detail.refetch();
      await qc.invalidateQueries({ queryKey: ["protocol-devices", provider] });
    } catch {
      setError(no ? "Bildet kunne ikke lagres." : "Image could not be saved.");
    } finally {
      setImageBusy(false);
    }
  }
  const fields = d
    ? [
        [no ? "Produsent" : "Manufacturer", d.manufacturer],
        [no ? "Modell" : "Model", d.model],
        [no ? "Rom" : "Room", d.area],
        ["Firmware", d.firmware],
        [
          no ? "Tilkobling" : "Connection",
          (
            {
              online: no ? "Tilkoblet" : "Connected",
              offline: no ? "Utilgjengelig" : "Unavailable",
              asleep: no ? "Sover" : "Sleeping",
              awake: no ? "Våken" : "Awake",
              unknown: no ? "Ukjent" : "Unknown",
            } as Record<string, string>
          )[d.status] ?? d.status,
        ],
        ["LQI (0–255)", d.lqi],
        ["Hardware", d.hardware],
        [no ? "Strømkilde" : "Power source", d.power_source],
        [no ? "Enhets-ID" : "Device ID", d.id],
        ["Node", d.node_id],
        [no ? "Nettverksadresse" : "Network address", d.network_address],
        [
          no ? "Sikker tilkobling" : "Secure connection",
          d.secure == null
            ? undefined
            : d.secure
              ? no
                ? "Ja"
                : "Yes"
              : no
                ? "Nei"
                : "No",
        ],
        [no ? "Intervju" : "Interview", d.interview_state],
      ]
    : [];
  return (
    <dialog
      className="device-dialog"
      ref={dialog}
      onClose={close}
      aria-labelledby="device-dialog-title"
    >
      <div className="device-dialog-header">
        <span className="eyebrow">
          {provider === "zigbee2mqtt" ? "Zigbee" : "Z-Wave"}
        </span>
        <button
          autoFocus
          aria-label={no ? "Lukk detaljer" : "Close details"}
          onClick={() => dialog.current?.close()}
        >
          <X />
        </button>
      </div>
      <div className="device-dialog-title">
        <div className="device-dialog-picture">
          <DevicePicture url={d?.image_url} name={name} />
        </div>
        <div>
          <h2 id="device-dialog-title">{d?.name || name}</h2>
          <p>
            {d?.description ||
              [d?.manufacturer, d?.model].filter(Boolean).join(" · ")}
          </p>
        </div>
      </div>
      {detail.isPending && (
        <p role="status">{no ? "Henter enhetsdata …" : "Loading device …"}</p>
      )}
      {(detail.isError || d?.network_status === "unavailable") && (
        <p role="alert">
          {no
            ? "Enhetsdata er utilgjengelige eller utdaterte. Styring er deaktivert til forbindelsen er tilbake."
            : "Device data is unavailable or stale. Controls are disabled until the connection returns."}
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      {d && (
        <>
          <h3>{no ? "Styring og måleverdier" : "Controls and readings"}</h3>
          {!d.controls.length && (
            <p>
              {no
                ? "Ingen tilgjengelige kontroller fra SMARTi for denne enheten ennå."
                : "SMARTi has no available controls for this device yet."}
            </p>
          )}
          <div className="device-detail-controls">
            {d.controls.map((c) => (
              <DeviceControl
                key={c.entity_id}
                c={c}
                no={no}
                disabled={
                  detail.isError ||
                  d.network_status !== "ready" ||
                  (c.domain === "automation" && !admin)
                }
                refresh={() => {
                  void detail.refetch();
                  void qc.invalidateQueries({ queryKey: ["home"] });
                }}
              />
            ))}
          </div>
          <h3>{no ? "Om enheten" : "About this device"}</h3>
          <dl className="device-facts">
            {fields
              .filter(([, value]) => value != null && value !== "")
              .map(([key, value]) => (
                <div key={String(key)}>
                  <dt>{key}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
          </dl>
          <div className="device-dialog-actions">
            <button
              disabled={detail.isFetching}
              onClick={() => void detail.refetch()}
            >
              {no ? "Oppdater enhetsdata" : "Refresh device data"}
            </button>
            {admin && d.removable && (
              <button
                disabled={detail.isError || d.network_status !== "ready"}
                onClick={() => {
                  dialog.current?.close();
                  remove();
                }}
              >
                {no ? "Slett enhet …" : "Remove device …"}
              </button>
            )}
          </div>
          {admin && (
            <details className="device-image-settings">
              <summary>
                {no ? "Endre enhetsbilde" : "Change device image"}
              </summary>
              <p>
                {no
                  ? "Last opp et produktbilde (PNG, JPEG eller WebP, maks 600 kB). Bildet lagres i SMARTi."
                  : "Upload a product image (PNG, JPEG or WebP, max 600 kB). The image is saved in SMARTi."}
              </p>
              <input
                aria-label={no ? "Velg enhetsbilde" : "Choose device image"}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                disabled={imageBusy}
                onChange={(e) => {
                  if (e.target.files?.[0]) void image(e.target.files[0]);
                  e.target.value = "";
                }}
              />
              {d.custom_image && (
                <button disabled={imageBusy} onClick={() => void image()}>
                  {no ? "Fjern eget bilde" : "Remove custom image"}
                </button>
              )}
            </details>
          )}
        </>
      )}
    </dialog>
  );
}
export function DeviceControl({
  c,
  no,
  disabled,
  refresh,
}: {
  c: Control;
  no: boolean;
  disabled: boolean;
  refresh: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const numeric = c.capabilities.find((cap) =>
    cap.actions.some((a) => a === "set_brightness" || a === "set_temperature"),
  );
  const current =
    numeric?.kind === "brightness"
      ? Math.round((Number(c.attributes.brightness ?? 0) / 255) * 100)
      : Number(c.attributes.temperature ?? numeric?.minimum ?? 0);
  const [value, setValue] = useState(current);
  useEffect(() => setValue(current), [current]);
  async function command(action: string, amount?: number) {
    setBusy(true);
    setMessage("");
    try {
      const result = await api<{ status: string }>(
        `controls/${encodeURIComponent(c.entity_id)}/commands`,
        "POST",
        { action, ...(amount == null ? {} : { value: amount }) },
      );
      setMessage(
        result.status === "state_updated"
          ? no
            ? "Oppdatert"
            : "Updated"
          : no
            ? "Kommando sendt – venter på enheten"
            : "Command sent – waiting for device",
      );
      refresh();
    } catch {
      setMessage(
        no
          ? "Kommandoen kunne ikke bekreftes. Kontroller enheten før nytt forsøk."
          : "Command was not confirmed. Check the device before retrying.",
      );
    } finally {
      setBusy(false);
    }
  }
  const blocked = busy || disabled || c.availability !== "available";
  const power = c.capabilities.some((cap) => cap.actions.includes("turn_on"));
  return (
    <section className="device-detail-control">
      <div>
        <strong>{c.name}</strong>
        <span>
          {c.state} {String(c.attributes.unit_of_measurement ?? "")}
        </span>
      </div>
      {power && (
        <div>
          <button
            disabled={blocked || c.state === "on"}
            onClick={() => void command("turn_on")}
          >
            {no ? "Slå på" : "Turn on"}
          </button>
          <button
            disabled={blocked || c.state === "off"}
            onClick={() => void command("turn_off")}
          >
            {no ? "Slå av" : "Turn off"}
          </button>
        </div>
      )}
      {numeric && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void command(numeric.actions[0], value);
          }}
        >
          <label>
            {numeric.kind === "brightness"
              ? no
                ? "Lysstyrke (%)"
                : "Brightness (%)"
              : no
                ? "Temperatur"
                : "Temperature"}
            <input
              type="number"
              min={numeric.minimum ?? undefined}
              max={numeric.maximum ?? undefined}
              step={numeric.step ?? 1}
              required
              disabled={blocked}
              value={value}
              onChange={(e) => setValue(Number(e.target.value))}
            />
          </label>
          <button disabled={blocked}>{no ? "Bruk" : "Apply"}</button>
        </form>
      )}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
