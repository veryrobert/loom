import { db, type Preset } from './db';
import { currentAccount } from './account';

export async function savePreset(name: string, mode: string, state: Record<string, unknown>, thumb?: string): Promise<number> {
  return db.presets.add({ name, mode, state: { ...state }, thumb, createdAt: Date.now(), ownerId: currentAccount().id });
}

export async function listPresets(): Promise<Preset[]> {
  return db.presets.orderBy('createdAt').reverse().toArray();
}

export async function getPreset(id: number): Promise<Preset | undefined> {
  return db.presets.get(id);
}

export async function deletePreset(id: number): Promise<void> {
  await db.presets.delete(id);
}

export async function renamePreset(id: number, name: string): Promise<void> {
  await db.presets.update(id, { name });
}
