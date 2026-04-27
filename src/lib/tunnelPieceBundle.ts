import type { TunnelPieceFile } from "@/hooks/useTunnelState";

const DB_NAME = "izy-visa-tunnel";
const STORE_NAME = "piece_bundles";
const DB_VERSION = 1;

type TunnelPieceBundleRecord = {
  id: string;
  pieces: TunnelPieceFile[];
  createdAt: number;
};

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !("indexedDB" in window)) {
      reject(new Error("Stockage navigateur indisponible"));
      return;
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Impossible d'ouvrir le stockage local"));
  });
}

function withStore<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore, resolve: (value: T) => void, reject: (reason?: unknown) => void) => void,
): Promise<T> {
  return new Promise(async (resolve, reject) => {
    let db: IDBDatabase | null = null;

    try {
      db = await openDatabase();
      const transaction = db.transaction(STORE_NAME, mode);
      const store = transaction.objectStore(STORE_NAME);

      transaction.onabort = () => reject(transaction.error || new Error("Transaction IndexedDB annulee"));
      transaction.onerror = () => reject(transaction.error || new Error("Transaction IndexedDB echouee"));
      transaction.oncomplete = () => {
        db?.close();
      };

      action(store, resolve, reject);
    } catch (error) {
      db?.close();
      reject(error);
    }
  });
}

export function createTunnelPieceBundleId() {
  return `bundle-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function saveTunnelPieceBundle(id: string, pieces: TunnelPieceFile[]) {
  const record: TunnelPieceBundleRecord = {
    id,
    pieces,
    createdAt: Date.now(),
  };

  await withStore<void>("readwrite", (store, resolve, reject) => {
    const request = store.put(record);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error || new Error("Impossible d'enregistrer les pieces du tunnel"));
  });
}

export async function loadTunnelPieceBundle(id: string) {
  return withStore<TunnelPieceFile[] | null>("readonly", (store, resolve, reject) => {
    const request = store.get(id);
    request.onsuccess = () => {
      const record = request.result as TunnelPieceBundleRecord | undefined;
      resolve(record?.pieces || null);
    };
    request.onerror = () => reject(request.error || new Error("Impossible de relire les pieces du tunnel"));
  });
}

export async function deleteTunnelPieceBundle(id: string) {
  await withStore<void>("readwrite", (store, resolve, reject) => {
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error || new Error("Impossible de supprimer les pieces du tunnel"));
  });
}
