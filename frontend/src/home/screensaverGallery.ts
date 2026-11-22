export type ScreensaverPhoto = {
  id: string;
  name: string;
  image: Blob;
  thumbnail: Blob;
};

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
  update?: (photos: ScreensaverPhoto[]) => ScreensaverPhoto[],
): Promise<ScreensaverPhoto[]> {
  const db = await openGallery();
  try {
    return await new Promise<ScreensaverPhoto[]>((resolve, reject) => {
      const transaction = db.transaction(
        storeName,
        update ? "readwrite" : "readonly",
      );
      const store = transaction.objectStore(storeName);
      const request = store.get(owner);
      let photos: ScreensaverPhoto[] = [];
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

export function loadScreensaverPhotos(owner: string) {
  return photosFor(owner);
}

export function removeScreensaverPhoto(owner: string, id: string) {
  return photosFor(owner, (photos) =>
    photos.filter((photo) => photo.id !== id),
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

async function preparePhoto(file: File): Promise<ScreensaverPhoto> {
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

export async function addScreensaverPhotos(
  owner: string,
  files: readonly File[],
) {
  const current = await loadScreensaverPhotos(owner);
  const available = SCREENSAVER_GALLERY_LIMIT - current.length;
  const additions: ScreensaverPhoto[] = [];
  let rejected = 0;
  let limitReached = false;
  for (const file of files) {
    if (additions.length >= available) {
      limitReached = true;
      break;
    }
    try {
      additions.push(await preparePhoto(file));
    } catch {
      rejected++;
    }
  }
  const photos = additions.length
    ? await photosFor(owner, (existing) => {
        const capacity = SCREENSAVER_GALLERY_LIMIT - existing.length;
        if (additions.length > capacity) limitReached = true;
        return [...existing, ...additions.slice(0, capacity)];
      })
    : current;
  return { photos, rejected, limitReached };
}
