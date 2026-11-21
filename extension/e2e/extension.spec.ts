import { resolve } from 'node:path'
import { type BrowserContext, chromium, expect, test } from '@playwright/test'

// Loads the built extension into a real Chromium profile and exercises the chrome.* code paths
// that demo mode cannot reach: the manifest, the service worker, the new tab override,
// chrome.bookmarks, chrome.storage and the favicon endpoint.
const dist = resolve(import.meta.dirname, '../dist')
let context: BrowserContext

test.beforeAll(async () => {
  context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`],
  })
})
test.afterAll(() => context?.close())

test('installed extension shows real bookmarks on the new tab page', async () => {
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'))
  const extensionId = new URL(worker.url()).host

  await worker.evaluate(async () => {
    const folder = await chrome.bookmarks.create({ parentId: '1', title: 'Reading list' })
    await chrome.bookmarks.create({ parentId: folder.id, title: 'Example article', url: 'https://example.com/article?utm_source=x' })
    await chrome.bookmarks.create({ parentId: '1', title: 'Loose link', url: 'https://example.org/' })
  })
  // Bookmark changes schedule a sync alarm; periodic alarms were registered on install.
  const alarms = await worker.evaluate(async () => (await chrome.alarms.getAll()).map((a) => a.name).sort())
  expect(alarms).toEqual(['link-check', 'sync', 'sync-soon'])

  const page = await context.newPage()
  await page.goto('chrome://newtab')
  await expect(page).toHaveURL(`chrome-extension://${extensionId}/newtab.html`)
  await expect(page.getByRole('button', { name: /^Reading list/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /^Bookmarks bar/ })).toBeVisible()
  await page.getByRole('button', { name: /^Reading list/ }).click()
  const link = page.getByRole('link', { name: 'Example article', exact: true })
  await expect(link).toHaveAttribute('href', 'https://example.com/article?utm_source=x')
  await expect(link.locator('img')).toHaveAttribute('src', new RegExp(`^chrome-extension://${extensionId}/_favicon/`))
  await expect(page.getByText('Demo mode')).toHaveCount(0)

  // The page updates live when a bookmark is added elsewhere in the browser.
  await worker.evaluate(() => chrome.bookmarks.create({ parentId: '1', title: 'Added later', url: 'https://example.net/' }))
  await page.getByRole('button', { name: /^Bookmarks bar/ }).click()
  await expect(page.getByRole('link', { name: 'Added later', exact: true })).toBeVisible()

  // Pinning persists through chrome.storage, and opening a link is logged there.
  await page.getByRole('listitem').filter({ has: page.getByRole('link', { name: 'Loose link', exact: true }) }).first().hover()
  await page.getByRole('button', { name: 'Pin Loose link' }).click()
  await page.keyboard.press('/')
  await page.getByRole('combobox', { name: 'Search bookmarks or the web' }).fill('artcle') // typo on purpose
  await expect(page.getByRole('option').first()).toContainText('Example article')
  await page.keyboard.press('Escape')
  await context.route('https://example.org/**', (route) => route.fulfill({ body: 'ok', contentType: 'text/html' }))
  // Links open in a new tab, so this page stays where it is.
  const [opened] = await Promise.all([context.waitForEvent('page'), page.getByRole('region', { name: 'Favourites' }).getByRole('link', { name: 'Loose link', exact: true }).click()])
  await opened.waitForURL('https://example.org/')
  await opened.close()
  const stored = await worker.evaluate(() => chrome.storage.local.get(['favourites', 'events']))
  expect(stored.favourites).toHaveLength(1)
  expect((stored.events as { type: string; url?: string; source?: string }[]).some((e) => e.type === 'open' && e.url === 'https://example.org/' && e.source === 'favourites')).toBe(true)

  // Removing a bookmark deletes it from Chrome itself; undo puts it back in the same folder.
  await page.goto(`chrome-extension://${extensionId}/newtab.html`)
  await page.getByRole('button', { name: /^Reading list/ }).click()
  const titles = () => worker.evaluate(async () => (await chrome.bookmarks.search({})).map((b) => b.title))
  await page.getByRole('listitem').filter({ has: page.getByRole('link', { name: 'Example article', exact: true }) }).first().hover()
  await page.getByRole('button', { name: 'Remove Example article' }).click()
  await expect.poll(titles).not.toContain('Example article')
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect.poll(titles).toContain('Example article')
  const restored = await worker.evaluate(async () => (await chrome.bookmarks.search({ title: 'Example article' }))[0])
  const folder = await worker.evaluate(async (id) => (await chrome.bookmarks.get(id))[0].title, restored.parentId!)
  expect(folder).toBe('Reading list')
  await expect(page.getByRole('link', { name: 'Example article', exact: true })).toBeVisible()

  // Nothing is synced unless the user turns it on.
  expect(await worker.evaluate(async () => (await chrome.storage.local.get('syncStatus')).syncStatus)).toBeUndefined()
})
