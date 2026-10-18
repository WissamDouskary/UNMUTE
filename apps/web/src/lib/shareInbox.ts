export interface ShareFile {
  name: string;
  type: string;
  blob: Blob;
}

export interface SharePayload {
  id: string;
  title: string;
  text: string;
  url: string;
  files: ShareFile[];
}

const DB_NAME = 'unmute-share';
const STORE = 'payload';
const KEY = 'latest';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE);
      }
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

/** Reads the latest share. It stays stored so a login redirect can still upload it. */
export async function takeShare(): Promise<SharePayload | null> {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const request = tx.objectStore(STORE).get(KEY);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve((request.result as SharePayload | undefined) ?? null);
    });
  } finally {
    db.close();
  }
}

export async function clearShare(): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const request = tx.objectStore(STORE).delete(KEY);
      request.onerror = () => reject(request.error);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export const shareInbox = {
  take: takeShare,
  clear: clearShare,
};
