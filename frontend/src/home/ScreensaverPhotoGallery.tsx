import { useEffect, useRef, useState, type CSSProperties } from "react";
import { ChevronDown, ImagePlus, Images, Trash2, Upload } from "lucide-react";
import {
  SCREENSAVER_GALLERY_LIMIT,
  SCREENSAVER_IMAGE_ACCEPT,
  type ScreensaverGallery,
  type ScreensaverPhoto,
} from "./screensaverGallery";
import { SettingsDialog } from "./SettingsDialog";

const photoIntervals = ["5", "10", "20", "30", "60"];
export const photoTimingPreference = {
  key: "smarti-screensaver-photo-interval",
  allowed: photoIntervals,
  initial: "10",
};

type Translate = (nb: string, en: string) => string;
type GalleryAction =
  | { kind: "share" }
  | { kind: "remove" | "remove-local"; photo: ScreensaverPhoto };

function usePhotoUrl(source: string | Blob) {
  const [objectUrl, setObjectUrl] = useState("");
  useEffect(() => {
    if (typeof source === "string") return;
    const url = URL.createObjectURL(source);
    setObjectUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [source]);
  return typeof source === "string" ? source : objectUrl;
}

function PhotoThumbnail({ photo }: { photo: ScreensaverPhoto }) {
  const url = usePhotoUrl(photo.thumbnail);
  return url && <img src={url} alt="" loading="lazy" decoding="async" />;
}

function SharedLibraryManager({
  gallery,
  confirm,
  t,
}: {
  gallery: ScreensaverGallery;
  confirm: (action: GalleryAction) => void;
  t: Translate;
}) {
  const input = useRef<HTMLInputElement>(null);
  const photos = gallery.photos.filter((photo) => !photo.local);
  const atLimit = gallery.sharedCount >= SCREENSAVER_GALLERY_LIMIT;
  const busy = gallery.loading || gallery.unavailable || !!gallery.busy;
  const addLabel = t("Legg til bilder", "Add photos");

  return (
    <details className="screensaver-library">
      <summary>
        <Images size={18} aria-hidden="true" />
        <span>{t("Administrer fellesbibliotek", "Manage shared library")}</span>
        <ChevronDown size={18} aria-hidden="true" />
      </summary>
      <div className="screensaver-library-content">
        <header>
          <p>
            {t(
              "Bildene i fellesbiblioteket kan brukes på alle skjermene i hjemmet.",
              "Photos in the shared library can be used on any screen in the home.",
            )}
          </p>
          <input
            ref={input}
            type="file"
            multiple
            accept={SCREENSAVER_IMAGE_ACCEPT}
            aria-label={addLabel}
            disabled={busy || atLimit}
            hidden
            onChange={(event) => {
              gallery.add(Array.from(event.target.files || []));
              event.target.value = "";
            }}
          />
          <button
            type="button"
            disabled={busy || atLimit}
            onClick={() => input.current?.click()}
          >
            <ImagePlus size={18} aria-hidden="true" /> {addLabel}
          </button>
        </header>
        {!!photos.length && (
          <ul className="screensaver-library-list" role="list">
            {photos.map((photo) => (
              <li key={photo.id}>
                <div className="screensaver-photo-thumb">
                  <PhotoThumbnail photo={photo} />
                </div>
                <span className="screensaver-photo-name" title={photo.name}>
                  {photo.name}
                </span>
                <button
                  type="button"
                  className="screensaver-photo-delete"
                  aria-label={t(
                    `Slett ${photo.name} fra fellesbiblioteket`,
                    `Delete ${photo.name} from the shared library`,
                  )}
                  disabled={busy}
                  onClick={() => confirm({ kind: "remove", photo })}
                >
                  <Trash2 size={18} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
        {gallery.localCount > 0 && (
          <button
            type="button"
            disabled={busy || atLimit}
            onClick={() => confirm({ kind: "share" })}
          >
            <Upload size={16} aria-hidden="true" />
            {t(
              "Del lokale bilder i fellesbiblioteket",
              "Share local photos to the library",
            )}
          </button>
        )}
        <div className="screensaver-gallery-status" role="status">
          {gallery.busy === "add" && (
            <p>{t("Lagrer bilder …", "Saving photos …")}</p>
          )}
          {gallery.busy === "remove" && (
            <p>{t("Sletter bilde …", "Deleting photo …")}</p>
          )}
          {gallery.busy === "share" && (
            <p>{t("Deler bilder …", "Sharing photos …")}</p>
          )}
          {!!gallery.result?.rejected && (
            <p>
              {t(
                "Ett eller flere bilder kunne ikke legges til.",
                "One or more photos could not be added.",
              )}
            </p>
          )}
          {(atLimit || gallery.result?.limitReached) && (
            <p>
              {t(
                `Fellesbiblioteket har plass til ${SCREENSAVER_GALLERY_LIMIT} bilder.`,
                `The shared library holds ${SCREENSAVER_GALLERY_LIMIT} photos.`,
              )}
            </p>
          )}
        </div>
      </div>
    </details>
  );
}

export function ScreensaverGallerySettings({
  gallery,
  showGallery,
  onChangeVisibility,
  selectedIds,
  onChangeSelection,
  onShareLocal,
  seconds,
  onChangeSeconds,
  lang,
}: {
  gallery: ScreensaverGallery;
  showGallery: boolean;
  onChangeVisibility: (show: boolean) => void;
  selectedIds: readonly string[] | null;
  onChangeSelection: (ids: string[] | null) => void;
  onShareLocal: () => void;
  seconds: string;
  onChangeSeconds: (seconds: string) => void;
  lang: string;
}) {
  const [confirmation, confirm] = useState<GalleryAction | null>(null);
  const t: Translate = (nb, en) => (lang === "en" ? en : nb);
  const selected = gallery.photos
    .filter((photo) => selectedIds === null || selectedIds.includes(photo.id))
    .map((photo) => photo.id);

  return (
    <section
      className="screensaver-gallery"
      aria-label={t("Bildegalleri", "Photo gallery")}
    >
      <header>
        <h3>{t("Bildegalleri", "Photo gallery")}</h3>
        <p>
          {t(
            "Velg hvilke bilder som skal vises på denne skjermen.",
            "Choose which photos to show on this screen.",
          )}
        </p>
      </header>
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
        {selected.length > 1 && (
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
      <div className="screensaver-gallery-status" role="status">
        {gallery.loading && <p>{t("Laster bilder …", "Loading photos …")}</p>}
        {gallery.unavailable && (
          <p>
            {t(
              "Kunne ikke hente fellesbiblioteket.",
              "Could not load the shared library.",
            )}
          </p>
        )}
        {gallery.busy === "remove-local" && (
          <p>{t("Sletter lokalt bilde …", "Deleting local photo …")}</p>
        )}
        {gallery.failed && (
          <p>
            {t(
              "Endringen kunne ikke lagres. Prøv igjen.",
              "Could not save the change. Please try again.",
            )}
          </p>
        )}
        {showGallery && gallery.photos.length > 0 && selected.length === 0 && (
          <p>
            {t(
              "Velg minst ett bilde for å vise galleriet.",
              "Select at least one photo to display the gallery.",
            )}
          </p>
        )}
      </div>
      {gallery.photos.length > 0 ? (
        <>
          <div className="screensaver-gallery-selection">
            <span role="status">
              {t(
                `${selected.length} av ${gallery.photos.length} valgt`,
                `${selected.length} of ${gallery.photos.length} selected`,
              )}
            </span>
            <div>
              <button
                type="button"
                onClick={() => onChangeSelection(null)}
                disabled={selectedIds === null}
              >
                {t("Velg alle", "Select all")}
              </button>
              <button
                type="button"
                onClick={() => onChangeSelection([])}
                disabled={!selected.length}
              >
                {t("Velg ingen", "Select none")}
              </button>
            </div>
          </div>
          <ul className="screensaver-photo-list" role="list">
            {gallery.photos.map((photo) => (
              <li key={photo.id}>
                <label className="screensaver-photo-choice">
                  <span className="screensaver-photo-thumb">
                    <PhotoThumbnail photo={photo} />
                  </span>
                  <input
                    type="checkbox"
                    aria-label={photo.name}
                    aria-describedby={
                      photo.local ? `screensaver-local-${photo.id}` : undefined
                    }
                    checked={selected.includes(photo.id)}
                    onChange={(event) =>
                      onChangeSelection(
                        event.target.checked
                          ? [...selected, photo.id]
                          : selected.filter((id) => id !== photo.id),
                      )
                    }
                  />
                  <span className="screensaver-photo-name" title={photo.name}>
                    {photo.name}
                  </span>
                  {photo.local && (
                    <small
                      className="screensaver-photo-local"
                      id={`screensaver-local-${photo.id}`}
                    >
                      {t("Kun på denne skjermen", "On this screen only")}
                    </small>
                  )}
                </label>
                {photo.local && (
                  <button
                    type="button"
                    className="screensaver-local-photo-delete"
                    aria-label={t(
                      `Slett lokalt bilde ${photo.name}`,
                      `Delete local photo ${photo.name}`,
                    )}
                    disabled={!!gallery.busy}
                    onClick={() => confirm({ kind: "remove-local", photo })}
                  >
                    <Trash2 size={16} aria-hidden="true" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </>
      ) : (
        !gallery.loading &&
        !gallery.unavailable && (
          <p className="screensaver-gallery-empty">
            {t("Fellesbiblioteket er tomt.", "The shared library is empty.")}
          </p>
        )
      )}
      {gallery.canManage && (
        <SharedLibraryManager gallery={gallery} confirm={confirm} t={t} />
      )}
      {confirmation && (
        <GalleryConfirmation
          action={confirmation}
          lang={lang}
          t={t}
          close={() => confirm(null)}
          accept={() => {
            if (confirmation.kind === "share") onShareLocal();
            else if (confirmation.kind === "remove")
              gallery.remove(confirmation.photo.id);
            else gallery.removeLocal(confirmation.photo.id);
            confirm(null);
          }}
        />
      )}
    </section>
  );
}

function GalleryConfirmation({
  action,
  lang,
  t,
  close,
  accept,
}: {
  action: GalleryAction;
  lang: string;
  t: Translate;
  close: () => void;
  accept: () => void;
}) {
  const shared = action.kind === "remove";
  const title =
    action.kind === "share"
      ? t("Del lokale bilder?", "Share local photos?")
      : shared
        ? t("Slett fra fellesbiblioteket?", "Delete from the shared library?")
        : t("Slett lokalt bilde?", "Delete local photo?");
  return (
    <SettingsDialog title={title} lang={lang} compact onClose={close}>
      <p>
        {action.kind === "share"
          ? t(
              "Alle med tilgang til hjemmet vil kunne bruke bildene.",
              "Anyone with access to the home will be able to use the photos.",
            )
          : shared
            ? t(
                `«${action.photo.name}» forsvinner fra alle skjermene som bruker det.`,
                `“${action.photo.name}” will be removed from every screen that uses it.`,
              )
            : t(
                `«${action.photo.name}» fjernes fra denne skjermen.`,
                `“${action.photo.name}” will be removed from this screen.`,
              )}
      </p>
      <div className="screensaver-confirm-actions">
        <button type="button" onClick={close}>
          {t("Avbryt", "Cancel")}
        </button>
        <button
          type="button"
          className={action.kind === "share" ? "primary" : "danger"}
          onClick={accept}
        >
          {action.kind === "share"
            ? t("Del bilder", "Share photos")
            : t("Slett bilde", "Delete photo")}
        </button>
      </div>
    </SettingsDialog>
  );
}

type PhotoFrame = { id: string; index: number };

function PhotoSlide({
  photo,
  index,
  onReady,
}: {
  photo: ScreensaverPhoto;
  index: number;
  onReady?: (frame: PhotoFrame) => void;
}) {
  const url = usePhotoUrl(photo.image);
  const [loadedUrl, setLoadedUrl] = useState("");
  if (!url) return null;
  return (
    <div className="screensaver-photo-slide">
      <img
        key={url}
        src={url}
        alt=""
        data-current={!!onReady || undefined}
        data-ready={loadedUrl === url || undefined}
        data-motion={index % 4}
        onLoad={() => {
          setLoadedUrl(url);
          onReady?.({ id: photo.id, index });
        }}
        decoding="async"
        draggable={false}
      />
    </div>
  );
}

export function ScreensaverPhotoSlideshow({
  photos,
  seconds,
}: {
  photos: ScreensaverPhoto[];
  seconds: string;
}) {
  const stage = useRef<HTMLDivElement>(null);
  const lastReady = useRef<PhotoFrame | null>(null);
  const [{ index, previous }, setPlayback] = useState<{
    index: number;
    previous: PhotoFrame | null;
  }>({ index: 0, previous: null });
  const count = photos.length;
  useEffect(() => {
    let timer: number | undefined;
    function schedule() {
      window.clearInterval(timer);
      stage.current?.toggleAttribute("data-paused", document.hidden);
      if (document.hidden || count < 2) return;
      timer = window.setInterval(
        () => {
          const previous = lastReady.current;
          setPlayback(({ index }) => ({ index: index + 1, previous }));
        },
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
  const currentIndex = previous?.id === current.id ? previous.index : index;
  const outgoing =
    previous && previous.id !== current.id
      ? photos.find(({ id }) => id === previous.id)
      : undefined;
  return (
    <div
      ref={stage}
      className="screensaver-photo-stage"
      aria-hidden="true"
      data-single={count === 1 || undefined}
      style={{ "--screensaver-photo-duration": `${seconds}s` } as CSSProperties}
    >
      {previous && outgoing && (
        <PhotoSlide
          key={`${previous.index}:${outgoing.id}`}
          photo={outgoing}
          index={previous.index}
        />
      )}
      <PhotoSlide
        key={`${currentIndex}:${current.id}`}
        photo={current}
        index={currentIndex}
        onReady={(frame) => {
          lastReady.current = frame;
        }}
      />
    </div>
  );
}
