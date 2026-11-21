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
    const gone = new Set(await kv.get<string[]>('demoFoldersGone', []))
    const names = await kv.get<Record<string, string>>('demoFolderNames', {})
    const titles = await kv.get<Record<string, string>>('demoBookmarkTitles', {})
    return demoLibrary()
      .filter((b) => !removed.has(b.id) && !gone.has(b.folderId))
      .map((b) => (names[b.folderId] ? { ...b, folderName: names[b.folderId] } : b))
      .map((b) => (titles[b.id] ? { ...b, title: titles[b.id] } : b))
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

/** Renames a bookmark in the browser (the page it points to is unchanged). */
export async function renameBookmark(bookmark: Bookmark, title: string): Promise<void> {
  if (!isExtension) {
    await kv.set('demoBookmarkTitles', { ...(await kv.get<Record<string, string>>('demoBookmarkTitles', {})), [bookmark.id]: title })
    return
  }
  await chrome.bookmarks.update(bookmark.id, { title })
}

// ---- folders -----------------------------------------------------------------------------

export interface FolderInfo {
  id: string
  name: string
}

function walkFolders(nodes: chrome.bookmarks.BookmarkTreeNode[], out: FolderInfo[]) {
  for (const node of nodes) {
    if (node.url || !node.children) continue
    // A folder that only holds other folders is not a card; the ones inside it are.
    if (node.children.length === 0 || node.children.some((c) => c.url)) out.push({ id: node.id, name: node.title })
    walkFolders(node.children, out)
  }
}

/** Chrome's own containers (Bookmarks bar, Other bookmarks, ...) cannot be renamed or deleted. */
export const isRootFolder = (id: string): boolean => (isExtension ? ['1', '2', '3'].includes(id) : id === 'root')

/** Every folder, empty ones included, so a folder you just made has a place before it holds a link. */
export async function loadFolders(): Promise<FolderInfo[]> {
  if (!isExtension) {
    const gone = new Set(await kv.get<string[]>('demoFoldersGone', []))
    const names = await kv.get<Record<string, string>>('demoFolderNames', {})
    const custom = await kv.get<FolderInfo[]>('demoFolders', [])
    const fromLibrary = new Map<string, FolderInfo>()
    for (const b of demoLibrary()) fromLibrary.set(b.folderId, { id: b.folderId, name: b.folderName })
    return [...fromLibrary.values(), ...custom].filter((f) => !gone.has(f.id)).map((f) => ({ ...f, name: names[f.id] ?? f.name }))
  }
  const [root] = await chrome.bookmarks.getTree()
  const out: FolderInfo[] = []
  for (const container of root.children ?? []) walkFolders(container.children ?? [], out)
  return out
}

/** New folders go on the Bookmarks bar, Chrome's own first container. */
export async function createFolder(name: string): Promise<FolderInfo> {
  if (!isExtension) {
    const folder = { id: `f-${crypto.randomUUID()}`, name }
    await kv.set('demoFolders', [...(await kv.get<FolderInfo[]>('demoFolders', [])), folder])
    return folder
  }
  const node = await chrome.bookmarks.create({ parentId: '1', title: name })
  return { id: node.id, name }
}

export async function renameFolder(ids: string[], name: string): Promise<void> {
  if (!isExtension) {
    await kv.set('demoFolderNames', { ...(await kv.get<Record<string, string>>('demoFolderNames', {})), ...Object.fromEntries(ids.map((id) => [id, name])) })
    return
  }
  await Promise.all(ids.map((id) => chrome.bookmarks.update(id, { title: name })))
}

async function restoreTree(node: chrome.bookmarks.BookmarkTreeNode, parentId: string, index?: number): Promise<string> {
  const made = await chrome.bookmarks.create({ parentId, index, title: node.title, url: node.url })
  for (const child of node.children ?? []) await restoreTree(child, made.id)
  return made.id
}

/**
 * Deletes folders and everything in them. The returned function puts them back (Chrome gives
 * restored nodes new ids) and resolves to the first restored folder's id.
 */
export async function deleteFolders(ids: string[]): Promise<() => Promise<string>> {
  if (!isExtension) {
    await kv.set('demoFoldersGone', [...(await kv.get<string[]>('demoFoldersGone', [])), ...ids])
    return async () => {
      await kv.set('demoFoldersGone', (await kv.get<string[]>('demoFoldersGone', [])).filter((id) => !ids.includes(id)))
      return ids[0]
    }
  }
  const trees = await Promise.all(ids.map(async (id) => (await chrome.bookmarks.getSubTree(id))[0]))
  await Promise.all(ids.map((id) => chrome.bookmarks.removeTree(id)))
  return async () => {
    const restored: string[] = []
    for (const tree of trees) restored.push(await restoreTree(tree, tree.parentId ?? '1', tree.index))
    return restored[0]
  }
}

// ---- tab groups --------------------------------------------------------------------------

/** Opens every link as one named tab group (the first one focused). Plain tabs outside Chrome. */
export async function openAllInGroup(urls: string[], title: string): Promise<void> {
  if (!isExtension || !chrome.tabs?.group) {
    for (const url of urls) window.open(url, '_blank', 'noopener')
    return
  }
  const tabs = await Promise.all(urls.map((url, i) => chrome.tabs.create({ url, active: i === 0 })))
  const tabIds = tabs.flatMap((t) => (t.id === undefined ? [] : [t.id]))
  if (tabIds.length === 0) return
  // The bundled typings describe these calls as callback style; with no callback they return promises.
  const groupId = await (chrome.tabs.group({ tabIds: tabIds as [number, ...number[]] }) as unknown as Promise<number>)
  await chrome.tabGroups.update(groupId, { title, collapsed: false })
}

// ---- web search --------------------------------------------------------------------------

const SCHEME = /^[a-z][a-z0-9+.-]*:\/\/\S+$/i
const HOSTLIKE = /^(localhost|(\d{1,3}\.){3}\d{1,3}|([a-z0-9-]+\.)+[a-z]{2,})(:\d+)?([/?#]\S*)?$/i

/** The address a typed line stands for, or null when it is just words to search for. */
export function asUrl(text: string): string | null {
  const t = text.trim()
  if (SCHEME.test(t)) return t
  return HOSTLIKE.test(t) ? `https://${t}` : null
}

/** Searches with the browser's own default search engine; the demo page falls back to Google. */
export function webSearch(text: string, newTab: boolean): void {
  if (isExtension && chrome.search) {
    void chrome.search.query({ text, disposition: newTab ? 'NEW_TAB' : 'CURRENT_TAB' })
    return
  }
  const url = `https://www.google.com/search?q=${encodeURIComponent(text)}`
  if (newTab) window.open(url, '_blank', 'noopener')
  else window.location.assign(url)
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
  return `chrome-extension://${chrome.runtime.id}/_favicon/?pageUrl=${encodeURIComponent(pageUrl)}&size=64`
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
