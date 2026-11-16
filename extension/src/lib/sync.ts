// Offline-first sync. The extension keeps a snapshot of what the server last accepted and sends
// only the difference, so any amount of offline editing reconciles in one request later.
// The push is idempotent on the server, which makes retrying after a dropped connection safe.

import { apiFetch } from './api'
import { kv, loadBookmarks } from './platform'
import { getEvents, getSettings } from './store'
import type { Bookmark, UsageEvent } from './types'
import { canonicalise, isWebUrl } from './urls'

export interface PageText {
  description: string
  text: string
}

interface Upsert {
  url: string
  title: string
  folder: string
  added_at: number
  updated_at: number
  description?: string
  text?: string
}

export type Snapshot = Record<string, string>

export interface SyncStatus {
  at: number
  ok: boolean
  message: string
}

export function diffSnapshot(previous: Snapshot, bookmarks: Bookmark[], pageText: Record<string, PageText>, now: number) {
  const next: Snapshot = {}
  const upserts: Upsert[] = []
  for (const b of bookmarks) {
    if (!isWebUrl(b.url)) continue
    const key = canonicalise(b.url)
    if (key in next) continue // exact duplicate of a bookmark already in this batch
    const page = pageText[key]
    const fingerprint = `${b.title}\u0000${b.folder}\u0000${page ? page.text.length + page.description.length : 0}`
    next[key] = fingerprint
    if (previous[key] !== fingerprint) {
      upserts.push({ url: b.url, title: b.title, folder: b.folder, added_at: b.addedAt, updated_at: now, ...(page ?? {}) })
    }
  }
  const deletes = Object.keys(previous).filter((key) => !(key in next))
  return { upserts, deletes, next }
}

export function unsentEvents(events: UsageEvent[], watermark: number): UsageEvent[] {
  return events.filter((e) => e.ts > watermark)
}

export async function runSync(): Promise<SyncStatus> {
  const settings = await getSettings()
  if (!settings.syncEnabled) return { at: Date.now(), ok: false, message: 'Sync is off' }
  let status: SyncStatus
  try {
    const [bookmarks, previous, watermark, events] = await Promise.all([
      loadBookmarks(),
      kv.get<Snapshot>('syncSnapshot', {}),
      kv.get<number>('eventsSyncedTo', 0),
      getEvents(),
    ])
    // Captured page text is only attached while the user has that feature switched on.
    const pageText = settings.capturePageText ? await kv.get<Record<string, PageText>>('pageText', {}) : {}
    const { upserts, deletes, next } = diffSnapshot(previous, bookmarks, pageText, Date.now())
    const pending = unsentEvents(events, watermark)
    if (upserts.length || deletes.length || pending.length) {
      await apiFetch('/sync', { method: 'POST', body: JSON.stringify({ upserts, deletes, events: pending }) })
      await kv.set('syncSnapshot', next)
      if (pending.length) await kv.set('eventsSyncedTo', Math.max(...pending.map((e) => e.ts)))
    }
    const changed = upserts.length + deletes.length
    status = { at: Date.now(), ok: true, message: changed || pending.length ? `Sent ${changed} bookmark changes and ${pending.length} events` : 'Already up to date' }
  } catch (error) {
    // Nothing was marked as sent, so the same changes go out on the next attempt.
    status = { at: Date.now(), ok: false, message: error instanceof Error ? error.message : 'Sync failed' }
  }
  await kv.set('syncStatus', status)
  return status
}

/** Forget what the server has, e.g. after deleting the server copy or switching accounts. */
export async function resetSyncState(): Promise<void> {
  await Promise.all([kv.set('syncSnapshot', {}), kv.set('eventsSyncedTo', 0), kv.set('syncStatus', null)])
}
