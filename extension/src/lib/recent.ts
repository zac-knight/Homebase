// "Pick up where you left off": tabs you closed recently, and pages you visited lately, merged
// newest first. Both need permission (sessions and history), asked for by a button on the page.

import { isExtension } from './platform'

export interface RecentItem {
  id: string
  title: string
  url: string
  ts: number
  kind: 'closed' | 'visited'
  /** Set for closed tabs, so they can be restored with their history intact. */
  sessionId?: string
}

const PERMISSIONS: chrome.permissions.Permissions = { permissions: ['history', 'sessions'] }

const isWeb = (url: string) => /^https?:\/\//i.test(url)

/** Newest first, one entry per page; a closed tab wins over a visit to the same page. */
export function mergeRecent(closed: RecentItem[], visited: RecentItem[], limit: number): RecentItem[] {
  const seen = new Set<string>()
  const out: RecentItem[] = []
  for (const item of [...closed, ...visited].sort((a, b) => b.ts - a.ts || (a.kind === 'closed' ? -1 : 1))) {
    if (!isWeb(item.url) || seen.has(item.url)) continue
    seen.add(item.url)
    out.push(item)
    if (out.length === limit) break
  }
  return out
}

export async function hasRecentAccess(): Promise<boolean> {
  return isExtension ? await chrome.permissions.contains(PERMISSIONS) : false
}
export async function requestRecentAccess(): Promise<boolean> {
  return isExtension ? await chrome.permissions.request(PERMISSIONS) : false
}

export async function loadRecent(limit = 5): Promise<RecentItem[]> {
  const sessions = await chrome.sessions.getRecentlyClosed({ maxResults: 12 })
  const closed: RecentItem[] = sessions.flatMap((s) => {
    const tab = s.tab ?? s.window?.tabs?.[0]
    return tab?.url ? [{ id: `c-${tab.sessionId ?? s.lastModified}`, title: tab.title || tab.url, url: tab.url, ts: s.lastModified * 1000, kind: 'closed' as const, sessionId: tab.sessionId ?? s.window?.sessionId }] : []
  })
  const history = await chrome.history.search({ text: '', maxResults: 40, startTime: Date.now() - 3 * 86_400_000 })
  const visited: RecentItem[] = history.map((h) => ({ id: `v-${h.id}`, title: h.title || h.url || '', url: h.url ?? '', ts: h.lastVisitTime ?? 0, kind: 'visited' as const }))
  return mergeRecent(closed, visited, limit)
}

export async function reopen(item: RecentItem, newTab: boolean): Promise<void> {
  if (item.sessionId && isExtension) await chrome.sessions.restore(item.sessionId)
  else if (newTab) window.open(item.url, '_blank', 'noopener')
  else window.location.assign(item.url)
}

/** A few believable entries so the demo page shows the row. */
export function demoRecent(): RecentItem[] {
  const m = 60_000
  const now = Date.now()
  return [
    { id: 'r1', title: 'Postgres EXPLAIN visualiser', url: 'https://explain.dalibo.com/', ts: now - 4 * m, kind: 'closed' },
    { id: 'r2', title: 'Attention Is All You Need (paper)', url: 'https://arxiv.org/abs/1706.03762', ts: now - 38 * m, kind: 'visited' },
    { id: 'r3', title: 'Interrail passes', url: 'https://www.interrail.eu/', ts: now - 3 * 60 * m, kind: 'closed' },
    { id: 'r4', title: 'Vite: Getting started', url: 'https://vite.dev/guide/', ts: now - 26 * 60 * m, kind: 'visited' },
  ]
}
