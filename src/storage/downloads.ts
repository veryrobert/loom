import { db, type DownloadRecord } from './db';
import { currentAccount } from './account';

// Exports are the gallery's Creations, so keep a good run of them
const MAX_DOWNLOADS = 120;

/** Triggers a real browser download and records a copy so it can be re-saved later. */
export async function saveToDevice(filename: string, blob: Blob, style?: DownloadRecord['style']): Promise<void> {
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
  await recordDownload(filename, blob, style);
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

/** Re-triggers the browser download for a previously saved export. */
export async function redownload(id: number): Promise<void> {
  const rec = await db.downloads.get(id);
  if (!rec) return;
  const url = URL.createObjectURL(rec.blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = rec.filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
