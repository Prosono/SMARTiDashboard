import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ApiError } from "../api";
export const words = (lang: string, nb: string, en: string) =>
  lang === "en" ? en : nb;
export function useWork(lang: string) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const qc = useQueryClient();
  async function run(work: () => Promise<unknown>, done?: () => void) {
    setBusy(true);
    setMessage("");
    try {
      await work();
      await qc.invalidateQueries({ queryKey: ["manage"] });
      await qc.invalidateQueries({ queryKey: ["home"] });
      done?.();
      return true;
    } catch (e) {
      setMessage(
        e instanceof ApiError && e.status === 409
          ? words(
              lang,
              "Oppsettet er endret eller handlingen er allerede i gang. Hent ny status før du prøver igjen. Ulagrede endringer er beholdt.",
              "The configuration changed or the action is already running. Refresh before retrying. Unsaved changes are preserved.",
            )
          : e instanceof ApiError && e.status === 404
            ? words(
                lang,
                "Oppsettet finnes ikke eller kan ikke redigeres gjennom appen. Automasjoner i egne YAML-filer må fortsatt redigeres der.",
                "The configuration is missing or cannot be edited here. Automations in separate YAML files must still be edited there.",
              )
            : words(
                lang,
                "Handlingen kunne ikke bekreftes. Kontroller status før du prøver igjen.",
                "The action could not be confirmed. Check status before retrying.",
              ),
      );
      return false;
    } finally {
      setBusy(false);
    }
  }
  return { busy, message, setMessage, run };
}
export function Feedback({ message }: { message: string }) {
  return message ? (
    <p className="notice" role="status">
      {message}
    </p>
  ) : null;
}
export function LoadError({
  lang,
  retry,
}: {
  lang: string;
  retry: () => void;
}) {
  return (
    <div className="quiet-notice" role="alert">
      <p>
        {words(
          lang,
          "Kunne ikke hente data. Kontroller forbindelsen.",
          "Could not load data. Check the connection.",
        )}
      </p>
      <button onClick={retry}>{words(lang, "Prøv igjen", "Retry")}</button>
    </div>
  );
}
