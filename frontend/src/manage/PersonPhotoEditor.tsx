import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Camera } from "lucide-react";
import { api } from "../api";
import { HouseholdPhoto, readPhoto } from "./Accounts";

export function PersonPhotoEditor({
  entityId,
  name,
  lang,
  disabled,
}: {
  entityId: string;
  name: string;
  lang: string;
  disabled: boolean;
}) {
  const t = (nb: string, en: string) => (lang === "en" ? en : nb);
  const qc = useQueryClient();
  const [photo, setPhoto] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  async function pick(file: File) {
    setBusy(true);
    setError("");
    setMessage("");
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
  async function save(data: string) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await api(`home/people/${encodeURIComponent(entityId)}/photo`, "PUT", {
        data,
      });
      setPhoto("");
      setRevision((v) => v + 1);
      await qc.invalidateQueries({ queryKey: ["people-preferences"] });
      window.dispatchEvent(new Event("smarti-profile-photo"));
      setMessage(t("Profilbildet er oppdatert.", "Profile photo updated."));
    } catch {
      setError(
        t(
          "Kunne ikke lagre bildet. Prøv igjen.",
          "Could not save the photo. Try again.",
        ),
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <fieldset disabled={busy || disabled} className="person-photo-settings">
      <legend>{t("Profilbilde", "Profile photo")}</legend>
      <div className="account-photo-editor">
        <HouseholdPhoto
          name={name}
          src={
            photo
              ? `data:image/jpeg;base64,${photo}`
              : `api/home/people/${encodeURIComponent(entityId)}/photo?v=${revision}`
          }
        />
        <label>
          <Camera size={18} /> {t("Velg nytt bilde", "Choose new photo")}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void pick(file);
            }}
          />
        </label>
      </div>
      <div className="row-actions">
        <button
          type="button"
          className="primary compact"
          disabled={!photo}
          onClick={() => void save(photo)}
        >
          {t("Lagre profilbilde", "Save profile photo")}
        </button>
        <button type="button" onClick={() => void save("")}>
          {t("Bruk systembildet", "Use system photo")}
        </button>
      </div>
      {message && <p role="status">{message}</p>}
      {error && (
        <p role="alert" className="notice">
          {error}
        </p>
      )}
    </fieldset>
  );
}
