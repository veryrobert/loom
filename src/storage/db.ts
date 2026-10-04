// Loom's persistence layer. Everything lives in IndexedDB (via Dexie) so it
// survives reloads and can hold real file data — localStorage can't store
// blobs and caps out around 5MB, which a few source photos would blow past.

import Dexie, { type Table } from 'dexie';

/** A saved snapshot of the control state (`v`), so a look can be recalled later. */
export interface Preset {
  id?: number;
  name: string;
  mode: string;
  createdAt: number;
  /** Shallow copy of the engine's `v` state object at save time. */
  state: Record<string, unknown>;
  /** Small JPEG data URL of the artwork when saved, for the gallery tile. */
  thumb?: string;
  /** Account the record belongs to ('local' until accounts exist). */
  ownerId?: string;
}

/** An uploaded source image/video, kept so it can be reopened without a file picker. */
export interface StoredFile {
  id?: number;
  name: string;
  type: string;
  size: number;
  createdAt: number;
  blob: Blob;
  ownerId?: string;
}

/** A past export (PNG/SVG/PDF/video), kept so it can be re-downloaded later. */
export interface DownloadRecord {
  id?: number;
  filename: string;
  mime: string;
  size: number;
  createdAt: number;
  blob: Blob;
  ownerId?: string;
}

class LoomDB extends Dexie {
  presets!: Table<Preset, number>;
  files!: Table<StoredFile, number>;
  downloads!: Table<DownloadRecord, number>;

  constructor() {
    super('loom');
    this.version(1).stores({
      presets: '++id, name, createdAt',
      files: '++id, name, createdAt',
      downloads: '++id, filename, createdAt',
    });
  }
}

export const db = new LoomDB();
