import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ImagePlus, X } from "lucide-react";
import {
  SCREENSAVER_GALLERY_LIMIT,
  SCREENSAVER_IMAGE_ACCEPT,
  addScreensaverPhotos,
  loadScreensaverPhotos,
  removeScreensaverPhoto,
  type ScreensaverPhoto,
} from "./screensaverGallery";

const emptyPhotos: ScreensaverPhoto[] = [];
const photoKey = (owner: string) => ["screensaver-photos", owner];
const photoIntervals = ["5", "10", "20", "30", "60"];
export const photoTimingPreference = {
  key: "smarti-screensaver-photo-interval",
  allowed: photoIntervals,
  initial: "10",
};

type GalleryChange =
  | { owner: string; kind: "add"; files: File[] }
  | { owner: string; kind: "remove"; id: string };

export function useScreensaverPhotoGallery(owner: string, enabled: boolean) {
  const query = useQuery({
    queryKey: photoKey(owner),
    queryFn: () => loadScreensaverPhotos(owner),
    enabled: enabled && !!owner,
    retry: false,
    staleTime: 30_000,
  });
  const client = useQueryClient();
  const change = useMutation({
    mutationFn: async (action: GalleryChange) => {
      if (action.kind === "add")
        return addScreensaverPhotos(action.owner, action.files);
      return {
        photos: await removeScreensaverPhoto(action.owner, action.id),
        rejected: 0,
        limitReached: false,
      };
    },
    onMutate: (action) =>
      client.cancelQueries({ queryKey: photoKey(action.owner) }),
    onSuccess: (result, action) => {
      client.setQueryData(photoKey(action.owner), result.photos);
    },
  });
  const current = change.variables?.owner === owner;
  return {
    photos: enabled ? (query.data ?? emptyPhotos) : emptyPhotos,
    loading: query.isPending,
    unavailable: query.isError,
    busy: current && change.isPending ? change.variables?.kind : undefined,
    failed: current && change.isError,
    result: current ? change.data : undefined,
    add(files: File[]) {
      if (!query.isSuccess || change.isPending || !files.length) return;
      change.mutate({ kind: "add", owner, files });
    },
    remove(id: string) {
      if (!query.isSuccess || change.isPending) return;
      change.mutate({ kind: "remove", owner, id });
    },
  };
}

function usePhotoUrl(blob: Blob) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    const next = URL.createObjectURL(blob);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [blob]);
  return url;
}

function PhotoThumbnail({ photo }: { photo: ScreensaverPhoto }) {
  const url = usePhotoUrl(photo.thumbnail);
  return url && <img src={url} alt="" loading="lazy" decoding="async" />;
}

export function ScreensaverGallerySettings({
  gallery,
  showGallery,
  onChangeVisibility,
  seconds,
  onChangeSeconds,
  lang,
}: {
  gallery: ReturnType<typeof useScreensaverPhotoGallery>;
  showGallery: boolean;
  onChangeVisibility: (show: boolean) => void;
  seconds: string;
  onChangeSeconds: (seconds: string) => void;
  lang: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const t = (nb: string, en: string) => (lang === "en" ? en : nb);
  const atLimit = gallery.photos.length >= SCREENSAVER_GALLERY_LIMIT;
  const addLabel = t("Legg til bilder", "Add photos");
  const disabled = gallery.loading || gallery.unavailable || !!gallery.busy;
  return (
    <section
      className="screensaver-gallery"
      aria-label={t("Bildegalleri", "Photo gallery")}
    >
      <header>
        <div>
          <h3>{t("Bildegalleri", "Photo gallery")}</h3>
          <p>
            {t(
              "Bildene lagres på denne enheten.",
              "Photos are stored on this device.",
            )}
          </p>
        </div>
        <input
          ref={input}
          type="file"
          multiple
          accept={SCREENSAVER_IMAGE_ACCEPT}
          aria-label={addLabel}
          disabled={disabled || atLimit}
          hidden
          onChange={(event) => {
            gallery.add(Array.from(event.target.files || []));
            event.target.value = "";
          }}
        />
        <button
          type="button"
          disabled={disabled || atLimit}
          onClick={() => input.current?.click()}
        >
          <ImagePlus size={18} aria-hidden="true" /> {addLabel}
        </button>
      </header>
      {gallery.photos.length > 0 ? (
        <ul className="screensaver-photo-list">
          {gallery.photos.map((photo) => (
            <li key={photo.id}>
              <div className="screensaver-photo-thumb">
                <PhotoThumbnail photo={photo} />
                <button
                  type="button"
                  aria-label={`${t("Fjern bilde", "Remove photo")} ${photo.name}`}
                  disabled={disabled}
                  onClick={() => gallery.remove(photo.id)}
                >
                  <X size={18} aria-hidden="true" />
                </button>
              </div>
              <span title={photo.name}>{photo.name}</span>
            </li>
          ))}
        </ul>
      ) : (
        !gallery.loading &&
        !gallery.unavailable && (
          <p className="screensaver-gallery-empty">
            {t(
              "Velg bildene du vil vise på skjermspareren.",
              "Choose photos to display in the screensaver.",
            )}
          </p>
        )
      )}
      {gallery.photos.length > 0 && (
        <div className="screensaver-photo-controls">
          <label className="screensaver-gallery-toggle">
            <input
              type="checkbox"
              role="switch"
              checked={showGallery}
              onChange={(event) => onChangeVisibility(event.target.checked)}
            />
            {t("Vis bildegalleri", "Show photo gallery")}
          </label>
          {gallery.photos.length > 1 && (
            <label className="screensaver-photo-duration">
              {t("Tid per bilde", "Time per photo")}
              <select
                value={seconds}
                onChange={(event) => onChangeSeconds(event.target.value)}
              >
                {photoIntervals.map((value) => (
                  <option key={value} value={value}>
                    {value} {t("sek", "sec")}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      )}
      <div className="screensaver-gallery-status" role="status">
        {gallery.loading && <p>{t("Laster bilder …", "Loading photos …")}</p>}
        {gallery.unavailable && (
          <p>
            {t(
              "Bildegalleriet er utilgjengelig i denne nettleseren.",
              "The photo gallery is unavailable in this browser.",
            )}
          </p>
        )}
        {gallery.busy && (
          <p>
            {gallery.busy === "add"
              ? t("Lagrer bilder …", "Saving photos …")
              : t("Fjerner bilde …", "Removing photo …")}
          </p>
        )}
        {gallery.failed && (
          <p>
            {t(
              "Endringen kunne ikke lagres. Prøv igjen.",
              "Could not save the change. Please try again.",
            )}
          </p>
        )}
        {!!gallery.result?.rejected && (
          <p>
            {t(
              "Ett eller flere bilder kunne ikke åpnes.",
              "One or more images could not be opened.",
            )}
          </p>
        )}
        {(atLimit || gallery.result?.limitReached) && (
          <p>
            {t(
              `Det er plass til ${SCREENSAVER_GALLERY_LIMIT} bilder.`,
              `The gallery holds ${SCREENSAVER_GALLERY_LIMIT} photos.`,
            )}
          </p>
        )}
      </div>
    </section>
  );
}

function PhotoSlide({
  photo,
  current,
}: {
  photo: ScreensaverPhoto;
  current: boolean;
}) {
  const url = usePhotoUrl(photo.image);
  const [ready, setReady] = useState(false);
  if (!url) return null;
  return (
    <img
      src={url}
      alt=""
      data-current={current || undefined}
      data-ready={ready || undefined}
      onLoad={() => setReady(true)}
      decoding="async"
      draggable={false}
    />
  );
}

export function ScreensaverPhotoSlideshow({
  photos,
  seconds,
}: {
  photos: ScreensaverPhoto[];
  seconds: string;
}) {
  const [index, setIndex] = useState(0);
  const count = photos.length;
  useEffect(() => {
    if (count < 2) return;
    let timer: number | undefined;
    function schedule() {
      window.clearInterval(timer);
      if (!document.hidden)
        timer = window.setInterval(
          () => setIndex((value) => value + 1),
          Number(seconds) * 1_000,
        );
    }
    schedule();
    document.addEventListener("visibilitychange", schedule);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", schedule);
    };
  }, [count, seconds]);
  if (!count) return null;
  const current = photos[index % count];
  const previous = count > 1 && index > 0 ? photos[(index - 1) % count] : null;
  return (
    <div className="screensaver-photo-stage" aria-hidden="true">
      {previous && (
        <PhotoSlide key={previous.id} photo={previous} current={false} />
      )}
      <PhotoSlide key={current.id} photo={current} current />
    </div>
  );
}
