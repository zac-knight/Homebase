// The only module that touches chrome.* for bookmarks and storage. Outside the extension
// (vite dev, Playwright) it serves a demo library from localStorage so the UI runs anywhere.

import demoBookmarks from '../../../sample-data/bookmarks.json'
import type { Bookmark, UsageEvent } from './types'

export const isExtension = typeof chrome !== 'undefined' && !!chrome.bookmarks

const DAY = 86_400_000
const PREFIX = 'homebase:'

export const kv = {
  async get<T>(key: string, fallback: T): Promise<T> {
    if (isExtension) {
      const got = await chrome.storage.local.get(key)
      return (got[key] as T | undefined) ?? fallback
    }
    try {
      const raw = localStorage.getItem(PREFIX + key)
      return raw === null ? fallback : (JSON.parse(raw) as T)
    } catch {
      return fallback
    }
  },
  async set(key: string, value: unknown): Promise<void> {
    if (isExtension) return chrome.storage.local.set({ [key]: value })
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(value))
    } catch {
      // storage full or blocked: the page still works for this session
    }
  },
  async clear(): Promise<void> {
    if (isExtension) await chrome.storage.local.clear()
    // Also clears the appearance mirror and any background picture kept in localStorage.
    for (const key of Object.keys(localStorage)) if (key.startsWith(PREFIX)) localStorage.removeItem(key)
  },
}

function flatten(nodes: chrome.bookmarks.BookmarkTreeNode[], path: string[], rootName: string, out: Bookmark[]) {
  for (const node of nodes) {
    if (node.url) {
      out.push({
        id: node.id,
        url: node.url,
        title: node.title || node.url,
        folder: path.join('/'),
        folderId: node.parentId ?? '0',
        folderName: path.at(-1) ?? rootName,
        addedAt: node.dateAdded ?? 0,
      })
    } else if (node.children) {
      flatten(node.children, [...path, node.title], rootName, out)
    }
  }
}

export async function loadBookmarks(): Promise<Bookmark[]> {
  if (!isExtension) {
    const removed = new Set(await kv.get<string[]>('demoRemoved', []))
    return demoLibrary().filter((b) => !removed.has(b.id))
  }
  const [root] = await chrome.bookmarks.getTree()
  const out: Bookmark[] = []
  // The root's children are the browser's own containers (Bookmarks bar, Other bookmarks, ...).
  for (const container of root.children ?? []) flatten(container.children ?? [], [], container.title, out)
  return out
}

/**
 * Deletes a bookmark from the browser. Returns an undo function that puts it back in the same
 * folder and position and resolves to the restored bookmark's id (Chrome assigns a new one).
 */
export async function removeBookmark(bookmark: Bookmark): Promise<() => Promise<string>> {
  if (!isExtension) {
    await kv.set('demoRemoved', [...(await kv.get<string[]>('demoRemoved', [])), bookmark.id])
    return async () => {
      await kv.set('demoRemoved', (await kv.get<string[]>('demoRemoved', [])).filter((id) => id !== bookmark.id))
      return bookmark.id
    }
  }
  const [node] = await chrome.bookmarks.get(bookmark.id)
  await chrome.bookmarks.remove(bookmark.id)
  return async () => (await chrome.bookmarks.create({ parentId: node.parentId, index: node.index, title: node.title, url: node.url })).id
}

export function onBookmarksChanged(callback: () => void): () => void {
  if (!isExtension) return () => {}
  const events = [chrome.bookmarks.onCreated, chrome.bookmarks.onRemoved, chrome.bookmarks.onChanged, chrome.bookmarks.onMoved]
  events.forEach((e) => (e as chrome.events.Event<() => void>).addListener(callback))
  return () => events.forEach((e) => (e as chrome.events.Event<() => void>).removeListener(callback))
}

/** Chrome's own favicon cache; no network request leaves the browser. */
export function faviconUrl(pageUrl: string): string | null {
  if (!isExtension) return null
  return `chrome-extension://${chrome.runtime.id}/_favicon/?pageUrl=${encodeURIComponent(pageUrl)}&size=32`
}

// ---- demo mode ---------------------------------------------------------------------------

function demoLibrary(): Bookmark[] {
  const now = Date.now()
  const base: Bookmark[] = demoBookmarks.map((b, i) => ({
    id: `d${i}`,
    url: b.url,
    title: b.title,
    folder: b.folder,
    folderId: b.folder || 'root',
    folderName: b.folder || 'Bookmarks bar',
    addedAt: now - (((i * 37) % 400) + (b.folder ? 20 : 2)) * DAY,
  }))
  // ?n=5000 pads the library with synthetic entries for performance testing.
  const n = Number(new URLSearchParams(location.search).get('n') ?? 0)
  for (let i = base.length; i < n; i++) {
    const folder = `Folder ${String((i % 80) + 1).padStart(2, '0')}`
    base.push({
      id: `s${i}`,
      url: `https://site-${i % 300}.example.com/page/${i}`,
      title: `${demoBookmarks[i % demoBookmarks.length].title} (${i})`,
      folder,
      folderId: folder,
      folderName: folder,
      addedAt: now - (i % 900) * DAY,
    })
  }
  return base
}

/** Deterministic pretend history so the demo's Insights page has something to show. */
export function demoEvents(bookmarks: Bookmark[]): UsageEvent[] {
  const events: UsageEvent[] = []
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  let seed = 7
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647
  for (let day = 29; day >= 0; day--) {
    for (const [hour, pool] of [[9, 12], [14, 30], [21, 58]] as const) {
      const count = Math.floor(rand() * 4) + (hour === 21 ? 1 : 0)
      for (let k = 0; k < count; k++) {
        const b = bookmarks[Math.floor(rand() * rand() * Math.min(pool, bookmarks.length))]
        const ts = today.getTime() - day * DAY + hour * 3_600_000 + k * 400_000
        if (ts > Date.now()) continue
        const d = new Date(ts)
        events.push({ id: `demo-${day}-${hour}-${k}`, type: 'open', url: b.url, source: 'folder', ts, hour: d.getHours(), dow: d.getDay() })
      }
    }
  }
  return events
}
