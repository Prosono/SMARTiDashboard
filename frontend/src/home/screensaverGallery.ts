import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../api";
import { writePreference } from "../preferences";

type PhotoSummary = {
  id: string;
  name: string;
};

export type ScreensaverPhoto = PhotoSummary & {
  image: string | Blob;
  thumbnail: string | Blob;
  local?: true;
};

type LocalPhoto = PhotoSummary & { image: Blob; thumbnail: Blob };

export const SCREENSAVER_GALLERY_LIMIT = 24;
const imageTypes = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "image/heic",
  "image/heif",
];
export const SCREENSAVER_IMAGE_ACCEPT = imageTypes.join(",");

const storeName = "galleries";
const photosPath = "home/screensaver/photos";

function openGallery() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("smarti-screensaver-gallery", 1);
    let blocked = false;
    request.onupgradeneeded = () => request.result.createObjectStore(storeName);
    request.onblocked = () => {
      blocked = true;
      reject(new Error("gallery_unavailable"));
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      if (blocked) request.result.close();
      else resolve(request.result);
    };
  });
}

async function photosFor(
  owner: string,
  update?: (photos: LocalPhoto[]) => LocalPhoto[],
): Promise<LocalPhoto[]> {
  const db = await openGallery();
  try {
    return await new Promise<LocalPhoto[]>((resolve, reject) => {
      const transaction = db.transaction(
        storeName,
        update ? "readwrite" : "readonly",
      );
      const store = transaction.objectStore(storeName);
      const request = store.get(owner);
      let photos: LocalPhoto[] = [];
      request.onsuccess = () => {
        photos = request.result ?? [];
        if (update) {
          photos = update(photos);
          if (photos.length) store.put(photos, owner);
          else store.delete(owner);
        }
      };
      transaction.oncomplete = () => resolve(photos);
      transaction.onerror = transaction.onabort = () =>
        reject(transaction.error ?? new Error("gallery_unavailable"));
    });
  } finally {
    db.close();
  }
}

function removeLocalPhotos(owner: string, ids: ReadonlySet<string>) {
  return photosFor(owner, (photos) =>
    photos.filter((photo) => !ids.has(photo.id)),
  );
}

async function decodePhoto(file: File) {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file);
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        dispose: () => bitmap.close(),
      };
    } catch {
      // Some formats decode through the browser's image element only.
    }
  }
  const url = URL.createObjectURL(file);
  const image = new Image();
  try {
    image.src = url;
    await image.decode();
    return {
      source: image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      dispose: () => URL.revokeObjectURL(url),
    };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

function resizePhoto(
  photo: Awaited<ReturnType<typeof decodePhoto>>,
  size: number,
  quality: number,
) {
  const scale = Math.min(1, size / Math.max(photo.width, photo.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(photo.width * scale));
  canvas.height = Math.max(1, Math.round(photo.height * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("invalid_photo");
  context.fillStyle = "#161515";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(photo.source, 0, 0, canvas.width, canvas.height);
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("invalid_photo"))),
      "image/jpeg",
      quality,
    ),
  );
}

async function preparePhoto(file: File): Promise<LocalPhoto> {
  if (
    file.size > 20_000_000 ||
    !(file.type
      ? imageTypes.includes(file.type)
      : /\.(jpe?g|png|webp|avif|heic|heif)$/i.test(file.name))
  )
    throw new Error("invalid_photo");
  const photo = await decodePhoto(file);
  try {
    if (
      !photo.width ||
      !photo.height ||
      photo.width * photo.height > 60_000_000
    )
      throw new Error("invalid_photo");
    const [image, thumbnail] = await Promise.all([
      resizePhoto(photo, 1920, 0.86),
      resizePhoto(photo, 224, 0.78),
    ]);
    return {
      id: Array.from(crypto.getRandomValues(new Uint8Array(16)), (value) =>
        value.toString(16).padStart(2, "0"),
      ).join(""),
      name: file.name.slice(0, 160),
      image,
      thumbnail,
    };
  } finally {
    photo.dispose();
  }
}

function base64(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",", 2)[1]);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

type SharedLibrary = { photos: PhotoSummary[] };
type GalleryChange = { owner: string } & (
  | { kind: "add"; files: File[] }
  | { kind: "share"; photos: LocalPhoto[] }
  | { kind: "remove"; id: string }
  | { kind: "remove-local"; id: string }
);

const sharedKey = ["screensaver-shared-photos"];
const localKey = (owner: string) => ["screensaver-local-photos", owner];
const emptyPhotos: LocalPhoto[] = [];
const emptySummaries: PhotoSummary[] = [];

function sharedPhoto(photo: PhotoSummary): ScreensaverPhoto {
  const image = new URL(`api/${photosPath}/${photo.id}`, document.baseURI);
  const thumbnail = new URL(image);
  thumbnail.searchParams.set("thumbnail", "1");
  return { ...photo, image: image.href, thumbnail: thumbnail.href };
}

async function uploadPhotos(
  items: readonly (File | LocalPhoto)[],
  update: (value: SharedLibrary) => void,
  library: SharedLibrary | undefined,
) {
  let rejected = 0;
  let limitReached = false;
  const uploaded = new Set<string>();
  let failed = false;
  for (const item of items) {
    if (
      library &&
      library.photos.length >= SCREENSAVER_GALLERY_LIMIT &&
      (item instanceof File || !library.photos.some(({ id }) => id === item.id))
    ) {
      limitReached = true;
      break;
    }
    let photo: LocalPhoto;
    try {
      photo = item instanceof File ? await preparePhoto(item) : item;
    } catch {
      rejected++;
      continue;
    }
    try {
      const [data, thumbnail] = await Promise.all([
        base64(photo.image),
        base64(photo.thumbnail),
      ]);
      library = await api<SharedLibrary>(photosPath, "POST", {
        id: photo.id,
        name: photo.name,
        data,
        thumbnail,
      });
      uploaded.add(photo.id);
      update(library);
    } catch (error) {
      limitReached =
        error instanceof ApiError && error.code === "screensaver_gallery_full";
      failed = !limitReached;
      break;
    }
  }
  return { uploaded, rejected, limitReached, failed };
}

export function useScreensaverPhotoGallery(
  owner: string,
  enabled: boolean,
  canManage: boolean,
) {
  const client = useQueryClient();
  const shared = useQuery({
    queryKey: sharedKey,
    queryFn: ({ signal }) =>
      api<SharedLibrary>(photosPath, "GET", undefined, signal),
    enabled,
    staleTime: 15_000,
    refetchInterval: 30_000,
    retry: false,
  });
  const local = useQuery({
    queryKey: localKey(owner),
    queryFn: () => photosFor(owner),
    enabled: enabled && !!owner,
    staleTime: Infinity,
    retry: false,
  });
  const change = useMutation({
    async mutationFn(action: GalleryChange) {
      const update = (value: SharedLibrary) =>
        client.setQueryData(sharedKey, value);
      if (action.kind === "remove-local") {
        const photos = await removeLocalPhotos(
          action.owner,
          new Set([action.id]),
        );
        client.setQueryData(localKey(action.owner), photos);
      } else if (action.kind === "remove") {
        update(
          await api<SharedLibrary>(`${photosPath}/${action.id}`, "DELETE"),
        );
      } else {
        const result = await uploadPhotos(
          action.kind === "add" ? action.files : action.photos,
          update,
          client.getQueryData<SharedLibrary>(sharedKey),
        );
        if (action.kind === "share" && result.uploaded.size) {
          const photos = await removeLocalPhotos(action.owner, result.uploaded);
          client.setQueryData(localKey(action.owner), photos);
        }
        return result;
      }
    },
    onMutate: () => client.cancelQueries({ queryKey: sharedKey }),
    onSettled: () => client.invalidateQueries({ queryKey: sharedKey }),
  });
  const onHub = shared.data?.photos ?? emptySummaries;
  const legacy = local.data ?? emptyPhotos;
  const sharedIds = new Set(onHub.map(({ id }) => id));
  const photos = [
    ...onHub.map(sharedPhoto),
    ...legacy
      .filter(({ id }) => !sharedIds.has(id))
      .map((photo): ScreensaverPhoto => ({
        ...photo,
        local: true,
      })),
  ];
  const current = change.variables?.owner === owner;
  const result = current ? change.data : undefined;
  const canWrite = canManage && shared.isSuccess && !change.isPending;
  return {
    photos,
    canManage,
    sharedCount: onHub.length,
    localCount: legacy.length,
    legacyIds: legacy.map(({ id }) => id),
    loading: shared.isPending,
    unavailable: shared.isError,
    busy: current && change.isPending ? change.variables?.kind : undefined,
    failed: current && (change.isError || !!result?.failed),
    result,
    add(files: File[]) {
      if (canWrite && files.length)
        change.mutate({ kind: "add", owner, files });
    },
    shareLocal() {
      if (canWrite && legacy.length)
        change.mutate({ kind: "share", owner, photos: legacy });
    },
    remove(id: string) {
      if (canWrite) change.mutate({ kind: "remove", owner, id });
    },
    removeLocal(id: string) {
      if (!change.isPending) change.mutate({ kind: "remove-local", owner, id });
    },
  };
}

export type ScreensaverGallery = ReturnType<typeof useScreensaverPhotoGallery>;

const selectionKey = "smarti-screensaver-photo-selection";

export function readScreensaverSelection(): string[] | null | undefined {
  try {
    const saved = localStorage.getItem(selectionKey);
    if (saved === null) return undefined;
    const ids: unknown = JSON.parse(saved);
    if (ids === null) return null;
    if (Array.isArray(ids))
      return ids.filter(
        (id) => typeof id === "string" && /^[0-9a-f]{32}$/.test(id),
      );
  } catch {
    // Storage can be unavailable or contain an old value.
  }
}

export function saveScreensaverSelection(ids: string[] | null) {
  writePreference(selectionKey, JSON.stringify(ids));
}
