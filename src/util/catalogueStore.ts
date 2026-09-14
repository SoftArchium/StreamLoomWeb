/**
 * IndexedDB persistence for the catalogue.
 *
 * localStorage could not hold this: the catalogue is several MB and the old
 * sl_catalogue_v5 write blew the ~5 MB quota, where the QuotaExceededError was
 * swallowed. Nothing was ever persisted, so every visit re-fetched everything.
 * IndexedDB has no such ceiling. Enriched channels are stored as-is, so a repeat
 * visit needs no Redis round-trip and no re-enrichment at all.
 */

import type { Category, EnrichedChannel } from '../api/types'

const DB_NAME = 'streamloom'
const DB_VERSION = 1
const STORE = 'catalogue'
const RECORD_KEY = 'current'
const TTL_MS = 60 * 60 * 1000 // 1 hour

export interface StoredCatalogue {
  channels: EnrichedChannel[]
  categories: Category[]
  epgIds: string[]
  ts: number
}

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') {
      resolve(null)
      return
    }
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION)
      request.onupgradeneeded = () => {
        const db = request.result
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE)
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
}

export async function readStoredCatalogue(): Promise<StoredCatalogue | null> {
  const db = await openDb()
  if (!db) return null
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readonly')
      const req = tx.objectStore(STORE).get(RECORD_KEY)
      req.onsuccess = () => {
        const value = req.result as StoredCatalogue | undefined
        db.close()
        if (!value) {
          resolve(null)
          return
        }
        if (Date.now() - value.ts > TTL_MS) {
          resolve(null)
          return
        }
        resolve(value)
      }
      req.onerror = () => {
        db.close()
        resolve(null)
      }
    } catch {
      db.close()
      resolve(null)
    }
  })
}

export async function writeStoredCatalogue(data: Omit<StoredCatalogue, 'ts'>): Promise<void> {
  const db = await openDb()
  if (!db) return
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).put({ ...data, ts: Date.now() }, RECORD_KEY)
      tx.oncomplete = () => {
        db.close()
        resolve()
      }
      tx.onerror = () => {
        db.close()
        resolve()
      }
      tx.onabort = () => {
        db.close()
        resolve()
      }
    } catch {
      db.close()
      resolve()
    }
  })
}

export async function clearStoredCatalogue(): Promise<void> {
  const db = await openDb()
  if (!db) return
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).delete(RECORD_KEY)
      tx.oncomplete = () => {
        db.close()
        resolve()
      }
      tx.onerror = () => {
        db.close()
        resolve()
      }
    } catch {
      db.close()
      resolve()
    }
  })
}
