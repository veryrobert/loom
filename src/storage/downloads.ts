import { db, type DownloadRecord } from './db';
import { currentAccount } from './account';

// Exports are the gallery's Creations, so keep a good run of them
const MAX_DOWNLOADS = 120;

export type Delivery = 'shared' | 'downloaded' | 'cancelled' | 'needs-tap';

function download(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Hands a finished image or video to the device. On phones that's the share sheet, whose "Save Image" /
 * "Save Video" puts it in the photo library (a plain download only reaches Files). Everywhere else it's a
 * normal download. The share sheet needs a fresh tap; if rendering took long enough for the browser to
 * refuse, this returns 'needs-tap' so the app can ask for one.
 */
export async function deliver(filename: string, blob: Blob): Promise<Delivery> {
  const file = new File([blob], filename, { type: blob.type });
  const phone = matchMedia('(pointer: coarse)').matches;
  const media = /^(image|video)\//.test(blob.type) && blob.type !== 'image/svg+xml';
  if (phone && media && navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return 'shared';
    } catch (err) {
      const name = (err as DOMException)?.name;
      if (name === 'AbortError') return 'cancelled';
      if (name === 'NotAllowedError') return 'needs-tap';
      // anything else: fall through to a plain download
    }
  }
  download(filename, blob);
  return 'downloaded';
}

/** Saves to the device (photo library on phones) and records a copy so it can be re-saved later. */
export async function saveToDevice(filename: string, blob: Blob, style?: DownloadRecord['style']): Promise<Delivery> {
  const result = await deliver(filename, blob);
  if (result !== 'cancelled') await recordDownload(filename, blob, style);
  return result;
}

export async function recordDownload(filename: string, blob: Blob, style?: DownloadRecord['style']): Promise<number> {
  const id = await db.downloads.add({
    filename,
    mime: blob.type,
    size: blob.size,
    createdAt: Date.now(),
    blob,
    ownerId: currentAccount().id,
    style,
  });
  const all = await db.downloads.orderBy('createdAt').reverse().toArray();
  const stale = all.slice(MAX_DOWNLOADS);
  if (stale.length) await db.downloads.bulkDelete(stale.map((d) => d.id!));
  return id;
}

export async function listDownloads(): Promise<DownloadRecord[]> {
  return db.downloads.orderBy('createdAt').reverse().toArray();
}

export async function deleteDownload(id: number): Promise<void> {
  await db.downloads.delete(id);
}

/** Saves a previously exported file again (photo library on phones). */
export async function redownload(id: number): Promise<{ result: Delivery; filename: string; blob: Blob } | null> {
  const rec = await db.downloads.get(id);
  if (!rec) return null;
  return { result: await deliver(rec.filename, rec.blob), filename: rec.filename, blob: rec.blob };
}
