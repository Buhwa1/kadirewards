"use client";

import type { QueuedAward } from "./types";

/**
 * The offline queue. Power cuts and dead 3G are normal, not exceptional, so a
 * sale is written to IndexedDB *first* and pushed to the server after. Every
 * entry carries a UUID idempotency key, so replaying the whole queue twice
 * awards points exactly once.
 */

const DB = "kadi-till";
const STORE = "queue";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "idem" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await open();
  return new Promise<T>((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => reject(req.error);
  });
}

export function newIdem() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

export function deviceId() {
  const KEY = "kadi_device_id";
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = newIdem();
    localStorage.setItem(KEY, id);
  }
  return id;
}

export const queue = {
  all: () => tx<QueuedAward[]>("readonly", (s) => s.getAll()),
  put: (item: QueuedAward) => tx<IDBValidKey>("readwrite", (s) => s.put(item)),
  remove: (idem: string) => tx<undefined>("readwrite", (s) => s.delete(idem)),
  clear: () => tx<undefined>("readwrite", (s) => s.clear()),
};

export async function pendingCount() {
  const all = await queue.all();
  return all.filter((q) => q.status !== "syncing").length;
}

/** Push everything queued. Returns per-item results so the UI can show failures. */
export async function flushQueue(): Promise<{ synced: number; failed: number }> {
  const items = (await queue.all()).filter((q) => q.status !== "syncing");
  if (items.length === 0) return { synced: 0, failed: 0 };

  for (const item of items) await queue.put({ ...item, status: "syncing" });

  let synced = 0;
  let failed = 0;

  try {
    const res = await fetch("/api/till/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const { results } = (await res.json()) as {
      results: { idem: string; ok: boolean; error?: string; permanent?: boolean }[];
    };

    for (const r of results) {
      const original = items.find((i) => i.idem === r.idem)!;
      if (r.ok) {
        await queue.remove(r.idem);
        synced++;
      } else if (r.permanent) {
        // a rule rejected it (cooldown, daily cap) — stop retrying, show the cashier
        await queue.put({ ...original, status: "failed", error: r.error, attempts: original.attempts + 1 });
        failed++;
      } else {
        await queue.put({ ...original, status: "pending", error: r.error, attempts: original.attempts + 1 });
        failed++;
      }
    }
  } catch (e) {
    for (const item of items) {
      await queue.put({
        ...item,
        status: "pending",
        error: e instanceof Error ? e.message : "offline",
        attempts: item.attempts + 1,
      });
    }
    failed = items.length;
  }

  return { synced, failed };
}
