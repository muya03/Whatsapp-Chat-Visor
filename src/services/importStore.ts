/**
 * Persistencia OPCIONAL de importaciones en IndexedDB (desactivada por defecto; ver preferencias).
 * Se guarda el archivo original (TXT o ZIP) tal cual, sin procesar, y solo si el usuario lo ha consentido.
 * Los metadatos van en un almacén aparte para poder listar sin tocar los blobs.
 */
const DB_NAME = 'wv-saved-chats';
const META = 'meta';
const BLOBS = 'blobs';

export interface SavedMeta {
  id: string;
  name: string;
  size: number;
  kind: 'txt' | 'zip';
  savedAt: number;
}

const FLAG = 'wv:saved';

/**
 * Indica si alguna vez se guardó algo. Evita abrir (y por tanto crear) la base IndexedDB en cada arranque
 * cuando el usuario nunca ha dado su consentimiento: sin guardados, la app no deja ninguna base vacía.
 */
export function hasSavedFlag(): boolean {
  try {
    return localStorage.getItem(FLAG) === '1';
  } catch {
    return false;
  }
}
const setFlag = (on: boolean) => {
  try {
    if (on) localStorage.setItem(FLAG, '1');
    else localStorage.removeItem(FLAG);
  } catch {
    /* sin acceso */
  }
};

export class StorageError extends Error {
  readonly code: 'quota' | 'unavailable' | 'aborted' | 'unknown';
  constructor(code: StorageError['code']) {
    super(code);
    this.code = code;
  }
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new StorageError('unavailable'));
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      db.createObjectStore(META, { keyPath: 'id' });
      db.createObjectStore(BLOBS);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(new StorageError('unavailable'));
    req.onblocked = () => reject(new StorageError('unavailable'));
  });
}

const wrap = <T,>(req: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

function mapError(e: unknown): StorageError {
  if (e instanceof StorageError) return e;
  const name = (e as { name?: string })?.name;
  if (name === 'QuotaExceededError') return new StorageError('quota');
  if (name === 'AbortError') return new StorageError('aborted');
  return new StorageError('unknown');
}

export async function listSaved(): Promise<SavedMeta[]> {
  if (!hasSavedFlag()) return [];
  try {
    const db = await open();
    const all = await wrap(db.transaction(META).objectStore(META).getAll() as IDBRequest<SavedMeta[]>);
    db.close();
    return all.sort((a, b) => b.savedAt - a.savedAt);
  } catch {
    return [];
  }
}

export async function saveImport(file: File, kind: 'txt' | 'zip', signal?: AbortSignal): Promise<SavedMeta> {
  const meta: SavedMeta = { id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`, name: file.name, size: file.size, kind, savedAt: Date.now() };
  try {
    const est = await navigator.storage?.estimate?.();
    if (est?.quota !== undefined && est.usage !== undefined && est.quota - est.usage < file.size * 1.05) throw new StorageError('quota');
    const db = await open();
    return await new Promise<SavedMeta>((resolve, reject) => {
      const tx = db.transaction([META, BLOBS], 'readwrite');
      const onAbort = () => tx.abort();
      signal?.addEventListener('abort', onAbort, { once: true });
      tx.objectStore(BLOBS).put(file, meta.id);
      tx.objectStore(META).put(meta);
      tx.oncomplete = () => {
        signal?.removeEventListener('abort', onAbort);
        db.close();
        setFlag(true);
        resolve(meta);
      };
      tx.onabort = () => {
        db.close();
        reject(signal?.aborted ? new StorageError('aborted') : mapError(tx.error));
      };
      tx.onerror = () => reject(mapError(tx.error));
    });
  } catch (e) {
    throw mapError(e);
  }
}

export async function loadSaved(id: string): Promise<File | null> {
  try {
    const db = await open();
    const meta = await wrap(db.transaction(META).objectStore(META).get(id) as IDBRequest<SavedMeta | undefined>);
    const blob = await wrap(db.transaction(BLOBS).objectStore(BLOBS).get(id) as IDBRequest<Blob | undefined>);
    db.close();
    if (!meta || !blob) return null;
    return new File([blob], meta.name, { type: blob.type });
  } catch {
    return null;
  }
}

export async function deleteSaved(id: string): Promise<void> {
  const db = await open();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([META, BLOBS], 'readwrite');
    tx.objectStore(META).delete(id);
    tx.objectStore(BLOBS).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

/** Borra TODO lo que la aplicación guarda localmente: importaciones, preferencias y cachés de la propia app. */
export async function deleteAllLocalData(): Promise<void> {
  await new Promise<void>((resolve) => {
    if (typeof indexedDB === 'undefined') return resolve();
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = req.onerror = req.onblocked = () => resolve();
  });
  try {
    localStorage.removeItem('wv:prefs');
  } catch {
    /* sin acceso */
  }
  setFlag(false);
}
