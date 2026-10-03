import { db, type StoredFile } from './db';

// Keep the recent-files list from growing without bound — old source files
// are the least likely to matter, so trim from the oldest end.
const MAX_FILES = 16;

export async function storeFile(file: File): Promise<number> {
  const id = await db.files.add({
    name: file.name,
    type: file.type,
    size: file.size,
    createdAt: Date.now(),
    blob: file,
  });
  const all = await db.files.orderBy('createdAt').reverse().toArray();
  const stale = all.slice(MAX_FILES);
  if (stale.length) await db.files.bulkDelete(stale.map((f) => f.id!));
  return id;
}

export async function listFiles(): Promise<StoredFile[]> {
  return db.files.orderBy('createdAt').reverse().toArray();
}

export async function getFile(id: number): Promise<StoredFile | undefined> {
  return db.files.get(id);
}

export async function deleteFile(id: number): Promise<void> {
  await db.files.delete(id);
}
