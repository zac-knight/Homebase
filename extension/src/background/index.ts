// Manifest V3 service worker: reacts to bookmark changes, schedules sync and link checks, and
// (opt-in) captures the text of pages as they are bookmarked. It holds no state in memory;
// Chrome may stop it at any time, so everything lives in chrome.storage and chrome.alarms.

import { extractPageText } from '../content/extract'
import { apiFetch } from '../lib/api'
import { kv } from '../lib/platform'
import { getSettings } from '../lib/store'
import { type PageText, runSync } from '../lib/sync'
import { canonicalise, isWebUrl } from '../lib/urls'

const MAX_CAPTURED_PAGES = 2000

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create('sync', { periodInMinutes: 30 })
  chrome.alarms.create('link-check', { periodInMinutes: 24 * 60, delayInMinutes: 5 })
})

// Batch bursts of edits (imports, folder moves) into one sync shortly afterwards.
const syncSoon = () => chrome.alarms.create('sync-soon', { delayInMinutes: 0.5 })
chrome.bookmarks.onChanged.addListener(syncSoon)
chrome.bookmarks.onMoved.addListener(syncSoon)
chrome.bookmarks.onRemoved.addListener(syncSoon)
chrome.bookmarks.onCreated.addListener((_id, node) => {
  syncSoon()
  if (node.url) void capturePage(node.url)
})

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'link-check') void requestLinkCheck()
  else void runSync()
})

async function capturePage(url: string): Promise<void> {
  const settings = await getSettings()
  if (!settings.capturePageText || !isWebUrl(url)) return
  if (!(await chrome.permissions.contains({ permissions: ['scripting'], origins: ['<all_urls>'] }))) return
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true })
  // Only read the page if it is the one that was just bookmarked.
  if (!tab?.id || !tab.url || canonicalise(tab.url) !== canonicalise(url)) return
  try {
    const [injection] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: extractPageText })
    const page = injection?.result as PageText | undefined
    if (!page || (!page.text && !page.description)) return
    const all = await kv.get<Record<string, PageText>>('pageText', {})
    all[canonicalise(url)] = page
    const keys = Object.keys(all)
    for (const old of keys.slice(0, Math.max(0, keys.length - MAX_CAPTURED_PAGES))) delete all[old]
    await kv.set('pageText', all)
  } catch {
    // Pages such as the Chrome Web Store refuse injection; the bookmark still syncs without text.
  }
}

async function requestLinkCheck(): Promise<void> {
  const settings = await getSettings()
  if (!settings.syncEnabled) return
  try {
    await apiFetch(`/jobs/check-links?limit=100&fetch_text=${settings.capturePageText}`, { method: 'POST' })
  } catch {
    // Offline or signed out; the next daily alarm tries again.
  }
}
