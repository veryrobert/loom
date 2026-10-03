import { db, type StoredFile } from './db';

// Keep the photo gallery from growing without bound — old source files are
// the least likely to matter, so trim from the oldest end.
const MAX_FILES = 60;

export async function storeFile(file: File): Promise<number> {
  // Re-uploading the same file moves it to the front rather than storing a duplicate
  const dupes = await db.files.where('name').equals(file.name).filter((f) => f.size === file.size).primaryKeys();
  if (dupes.length) await db.files.bulkDelete(dupes);
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
  const all = await db.files.orderBy('createdAt').reverse().toArray();
  // Tidy copies stored before duplicates were prevented: keep the newest of each name + size
  const seen = new Set<string>(), keep: StoredFile[] = [], drop: number[] = [];
  for (const f of all) { const k = f.name + '|' + f.size; if (seen.has(k)) drop.push(f.id!); else { seen.add(k); keep.push(f); } }
  if (drop.length) await db.files.bulkDelete(drop);
  return keep;
}

export async function getFile(id: number): Promise<StoredFile | undefined> {
  return db.files.get(id);
}

export async function deleteFile(id: number): Promise<void> {
  await db.files.delete(id);
}
