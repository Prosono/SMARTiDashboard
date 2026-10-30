import { createContext, useContext, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ImagePlus, LoaderCircle, Trash2, Upload } from "lucide-react";
import { api } from "../api";
import "./homeAppearance.css";

export const HeaderAppearance = createContext(false);
export type HomeAppearance = {
  background:
    | "auto"
    | "living"
    | "outdoor"
    | "kitchen"
    | "bedroom"
    | "office"
    | "custom"
    | "none";
  has_custom: boolean;
  image_version: string | null;
};
const photo = (name: string) =>
  new URL(`home/home-${name}.webp`, document.baseURI).href;
function useAppearance(enabled = true) {
  return useQuery({
    queryKey: ["home-appearance"],
    queryFn: () => api<HomeAppearance>("home/appearance"),
    enabled,
    staleTime: 300000,
    retry: false,
  });
}
function imageSource(pref: HomeAppearance | undefined, fallback: string) {
  if (pref?.background === "none") return null;
  if (pref?.background === "custom" && pref.has_custom)
    return new URL(
      `api/home/appearance/image?v=${encodeURIComponent(pref.image_version || "")}`,
      document.baseURI,
    ).href;
  return pref && !["auto", "custom"].includes(pref.background)
    ? photo(pref.background)
    : fallback;
}

/** Only Harmoni opts into photo headers. A failed decorative image leaves a readable solid backdrop. */
export function HomeHeaderImage({ fallback }: { fallback: string }) {
  const enabled = useContext(HeaderAppearance);
  const appearance = useAppearance(enabled);
  const [loaded, setLoaded] = useState("");
  const [failed, setFailed] = useState("");
  const src = imageSource(appearance.data, fallback);
  if (!enabled || !src || src === failed) return null;
  return (
    <img
      className="home-header-photo"
      src={src}
      alt=""
      aria-hidden="true"
      decoding="async"
      fetchPriority="high"
      data-ready={loaded === src}
      onLoad={() => setLoaded(src)}
      onError={() => setFailed(src)}
    />
  );
}

/** Bound image uploads before storing them in the existing personal settings store. */
async function prepareImage(file: File) {
  if (
    !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
    file.size > 15_000_000
  )
    throw new Error("invalid_image");
  const image = await createImageBitmap(file);
  try {
    if (image.width * image.height > 50_000_000)
      throw new Error("invalid_image");
    const scale = Math.min(1, 1920 / Math.max(image.width, image.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("canvas_unavailable");
    context.fillStyle = "#28313d";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.84, 0.68, 0.5]) {
      const data = canvas.toDataURL("image/jpeg", quality).split(",")[1];
      if (data && data.length <= 1_333_332) return data;
    }
    throw new Error("image_too_large");
  } finally {
    image.close();
  }
}

export function HomeBackgroundSettings({ lang }: { lang: string }) {
  const en = lang === "en",
    t = (nb: string, english: string) => (en ? english : nb);
  const q = useAppearance(),
    qc = useQueryClient();
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const choices: {
    id: HomeAppearance["background"];
    label: string;
    image?: string;
  }[] = [
    {
      id: "auto",
      label: t("Rom til rom", "Room by room"),
      image: photo("living"),
    },
    { id: "living", label: t("Stue", "Living room"), image: photo("living") },
    {
      id: "outdoor",
      label: t("Utendørs", "Outdoors"),
      image: photo("outdoor"),
    },
    { id: "kitchen", label: t("Kjøkken", "Kitchen"), image: photo("kitchen") },
    { id: "bedroom", label: t("Soverom", "Bedroom"), image: photo("bedroom") },
    { id: "office", label: t("Kontor", "Office"), image: photo("office") },
    ...(q.data?.has_custom
      ? [
          {
            id: "custom" as const,
            label: t("Mitt bilde", "My photo"),
            image: imageSource(
              { ...q.data, background: "custom" },
              photo("living"),
            )!,
          },
        ]
      : []),
    { id: "none", label: t("Uten bilde", "No photo") },
  ];
  async function save(work: () => Promise<HomeAppearance>) {
    if (busy || !q.data) return;
    setBusy(true);
    setMessage("");
    setError(false);
    try {
      const result = await work();
      qc.setQueryData(["home-appearance"], result);
      setMessage(t("Bakgrunnen er lagret.", "Background saved."));
    } catch {
      setError(true);
      setMessage(
        t(
          "Kunne ikke lagre bakgrunnen. Velg JPG, PNG eller WebP under 15 MB, eller prøv igjen.",
          "Could not save the background. Choose JPG, PNG or WebP under 15 MB, or try again.",
        ),
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="home-background-settings"
      aria-label={t("Bakgrunn i Hjem", "Home background")}
      aria-busy={busy}
    >
      <header>
        <ImagePlus size={22} />
        <div>
          <h3>{t("Bakgrunn i headerne", "Home header background")}</h3>
          <p>
            {t(
              "Gi Harmoni ditt eget uttrykk. Rom til rom gir hver fane sitt eget motiv.",
              "Make Harmoni your own. Room by room gives each view its own photo.",
            )}
          </p>
        </div>
      </header>
      {q.isError ? (
        <p role="alert">
          {t(
            "Kunne ikke hente bildevalget.",
            "Could not load background settings.",
          )}{" "}
          <button onClick={() => void q.refetch()}>
            {t("Prøv igjen", "Retry")}
          </button>
        </p>
      ) : (
        <>
          <div
            className="home-background-options"
            role="radiogroup"
            aria-label={t("Velg headerbakgrunn", "Choose header background")}
          >
            {choices.map((choice, index) => (
              <button
                type="button"
                key={choice.id}
                role="radio"
                aria-checked={q.data?.background === choice.id}
                aria-disabled={busy || undefined}
                tabIndex={q.data?.background === choice.id ? 0 : -1}
                disabled={!q.data}
                onKeyDown={(event) => {
                  const next =
                    event.key === "ArrowRight" || event.key === "ArrowDown"
                      ? (index + 1) % choices.length
                      : event.key === "ArrowLeft" || event.key === "ArrowUp"
                        ? (index + choices.length - 1) % choices.length
                        : event.key === "Home"
                          ? 0
                          : event.key === "End"
                            ? choices.length - 1
                            : null;
                  if (next === null) return;
                  event.preventDefault();
                  if (busy) return;
                  event.currentTarget.parentElement
                    ?.querySelectorAll<HTMLButtonElement>('[role="radio"]')
                    [next]?.focus();
                  void save(() =>
                    api<HomeAppearance>("home/appearance", "PUT", {
                      background: choices[next].id,
                    }),
                  );
                }}
                onClick={() =>
                  void save(() =>
                    api<HomeAppearance>("home/appearance", "PUT", {
                      background: choice.id,
                    }),
                  )
                }
              >
                <span className="home-background-thumb" data-kind={choice.id}>
                  {choice.image && (
                    <img src={choice.image} alt="" loading="lazy" />
                  )}
                  {q.data?.background === choice.id && (
                    <span className="home-background-check">
                      <Check size={15} />
                    </span>
                  )}
                </span>
                <span>{choice.label}</span>
              </button>
            ))}
          </div>
          <div className="home-background-actions">
            <button
              type="button"
              disabled={!q.data || busy}
              onClick={() => input.current?.click()}
            >
              {busy ? (
                <LoaderCircle className="spin" size={17} />
              ) : (
                <Upload size={17} />
              )}
              {t("Last opp eget bilde", "Upload your photo")}
            </button>
            <input
              ref={input}
              hidden
              type="file"
              accept="image/jpeg,image/png,image/webp"
              aria-label={t(
                "Last opp bakgrunnsbilde",
                "Upload background image",
              )}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file)
                  void save(async () =>
                    api<HomeAppearance>("home/appearance/image", "PUT", {
                      data: await prepareImage(file),
                    }),
                  );
              }}
            />
            {q.data?.has_custom && (
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void save(() =>
                    api<HomeAppearance>("home/appearance/image", "PUT", {
                      data: "",
                    }),
                  )
                }
              >
                <Trash2 size={16} />
                {t("Fjern eget bilde", "Remove my photo")}
              </button>
            )}
          </div>
          <small>
            {t(
              "Bildevalget følger kontoen din. Eget bilde lagres privat i SMARTi. JPG, PNG eller WebP, opptil 15 MB.",
              "Your choice follows your account. Your photo is stored privately in SMARTi. JPG, PNG or WebP, up to 15 MB.",
            )}
          </small>
          {q.isPending && (
            <p role="status">
              {t("Henter bakgrunner…", "Loading backgrounds…")}
            </p>
          )}
        </>
      )}
      {message && (
        <p
          className="home-background-feedback"
          role={error ? "alert" : "status"}
        >
          {message}
        </p>
      )}
    </section>
  );
}
