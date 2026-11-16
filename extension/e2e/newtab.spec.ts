import AxeBuilder from '@axe-core/playwright'
import { type Page, expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('/newtab.html')
  await expect(page.getByRole('heading', { name: 'Folders' })).toBeVisible()
})

/** Folders are tabs; choosing one shows its links in the panel below. */
const openFolder = (page: Page, name: string) => page.getByRole('region', { name: 'Folders' }).getByRole('button', { name: new RegExp(`^${name}\\b`) }).click()

test('the first folder is shown and choosing another switches the panel', async ({ page }) => {
  const folders = page.getByRole('region', { name: 'Folders' })
  await expect(folders.getByRole('button', { name: /^Bookmarks bar/ })).toHaveAttribute('aria-current', 'true')
  await expect(page.getByRole('link', { name: 'Hacker News' })).toBeVisible()
  const link = page.getByRole('link', { name: 'Use The Index, Luke' })
  await expect(link).toHaveCount(0)
  await openFolder(page, 'Databases')
  await expect(folders.getByRole('button', { name: /^Databases/ })).toHaveAttribute('aria-current', 'true')
  await expect(link.first()).toHaveAttribute('href', 'https://use-the-index-luke.com/')
  await expect(page.getByRole('link', { name: 'Hacker News' })).toHaveCount(0)
})

test('the home page fits the window without scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 800 })
  await openFolder(page, 'Dev')
  expect(await page.evaluate(() => document.scrollingElement!.scrollHeight - document.scrollingElement!.clientHeight)).toBe(0)
})

test('links open in a new tab unless that is switched off', async ({ page }) => {
  await openFolder(page, 'Databases')
  const link = page.getByRole('link', { name: 'Use The Index, Luke' }).first()
  await expect(link).toHaveAttribute('target', '_blank')
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByRole('switch', { name: 'Open links in a new tab' }).click()
  // The folder is still open when we come back.
  await page.getByRole('button', { name: 'Home', exact: true }).click()
  await expect(page.getByRole('link', { name: 'Use The Index, Luke' }).first()).not.toHaveAttribute('target', '_blank')
})

test('same-named folders are shown once', async ({ page }) => {
  await expect(page.locator('[data-folder-name]', { hasText: 'Bookmarks bar' })).toHaveCount(1)
})

test('tasks can be added, finished and cleared', async ({ page }) => {
  await page.getByRole('button', { name: 'Tasks', exact: true }).click()
  await page.getByLabel('New task').fill('Read week 3 notes')
  await page.keyboard.press('Enter')
  await page.getByLabel('Due date').fill('2020-01-01')
  await page.getByLabel('New task').fill('Submit report')
  await page.keyboard.press('Enter')
  // Dated tasks come first, and an old date reads as overdue.
  await expect(page.getByRole('listitem').first()).toContainText('Submit report')
  await expect(page.getByRole('listitem').first()).toContainText('overdue')
  await page.getByRole('checkbox', { name: 'Mark “Submit report” done' }).click()
  await expect(page.getByRole('checkbox', { name: 'Mark “Submit report” not done' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('checkbox', { name: 'Mark “Read week 3 notes” done' })).toBeVisible()
  await expect(page.getByRole('checkbox', { name: 'Mark “Submit report” not done' })).toBeVisible()
  await page.getByRole('button', { name: 'Clear done' }).click()
  await expect(page.getByText('Submit report')).toHaveCount(0)
})

test('there is no Right now panel', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'Right now' })).toHaveCount(0)
})

test('the Organise tab is gone', async ({ page }) => {
  await expect(page.getByRole('button', { name: 'Organise', exact: true })).toHaveCount(0)
})

test('search palette works from the keyboard alone', async ({ page }) => {
  await page.keyboard.press('/')
  const input = page.getByRole('combobox', { name: 'Search bookmarks' })
  await expect(input).toBeFocused()
  await input.fill('postgres index')
  const options = page.getByRole('option')
  await expect(options.first()).toContainText('PostgreSQL documentation: Indexes')
  await expect(options.first()).toHaveAttribute('aria-selected', 'true')
  await input.fill('git')
  await page.keyboard.press('ArrowDown')
  await expect(options.nth(1)).toHaveAttribute('aria-selected', 'true')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toBeHidden()
  await expect(page.getByRole('button', { name: /Search \d+ bookmarks/ })).toBeFocused()
  await page.keyboard.press('ControlOrMeta+k')
  await expect(page.getByRole('dialog')).toBeVisible()
})

test('opening a search result navigates and is logged', async ({ page }) => {
  await page.route('https://regex101.com/**', (route) => route.fulfill({ body: '<title>stub</title>', contentType: 'text/html' }))
  await page.keyboard.press('/')
  await page.getByRole('combobox').fill('regex101')
  await page.keyboard.press('Enter')
  await page.waitForURL('https://regex101.com/')
  await page.goto('/newtab.html')
  const events = await page.evaluate(() => JSON.parse(localStorage.getItem('homebase:events') ?? '[]'))
  expect(events.some((e: { type: string; url?: string; source?: string }) => e.type === 'open' && e.url === 'https://regex101.com/' && e.source === 'search')).toBe(true)
  expect(events.some((e: { type: string; query?: string }) => e.type === 'search' && e.query === 'regex101')).toBe(true)
})

test('pinning adds a favourite that survives a reload', async ({ page }) => {
  await openFolder(page, 'Tools')
  await page.getByRole('listitem').filter({ has: page.getByRole('link', { name: 'Excalidraw', exact: true }) }).first().hover()
  await page.getByRole('button', { name: 'Pin Excalidraw' }).click()
  const favourites = page.getByRole('region', { name: 'Favourites' })
  await expect(favourites.getByRole('link', { name: 'Excalidraw' })).toBeVisible()
  await page.reload()
  await expect(favourites.getByRole('link', { name: 'Excalidraw' })).toBeVisible()
  await favourites.getByRole('button', { name: 'Unpin Excalidraw' }).click()
  await expect(favourites.getByRole('link', { name: 'Excalidraw' })).toHaveCount(0)
})

test('folder tabs can be reordered with the keyboard', async ({ page }) => {
  const names = () => page.locator('[data-folder-name]').allTextContents()
  const before = await names()
  const handle = page.getByRole('region', { name: 'Folders' }).getByRole('button', { name: new RegExp(`^${before[0]}\\b`) })
  await handle.focus()
  // dnd-kit attaches its key listeners a tick after pick-up, so pace the keys like a person would.
  await page.keyboard.press('Space', { delay: 50 })
  await expect(handle).toHaveAttribute('aria-pressed', 'true')
  await page.keyboard.press('ArrowRight', { delay: 50 })
  // Drop only once the tab has visibly moved, however slow the machine is.
  await expect.poll(() => handle.evaluate((el) => (el as HTMLElement).style.transform)).toContain('translate3d')
  await page.keyboard.press('Space', { delay: 50 })
  await expect.poll(names).toEqual([before[1], before[0], ...before.slice(2)])
  await page.reload()
  await expect.poll(names).toEqual([before[1], before[0], ...before.slice(2)])
})

test('theme can be forced dark and insights render charts', async ({ page }) => {
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByRole('radio', { name: 'dark' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.getByRole('button', { name: 'Insights', exact: true }).click()
  await expect(page.getByRole('img', { name: /opened per day/ })).toBeVisible()
  await expect(page.locator('.recharts-bar-rectangle').first()).toBeVisible()
  await expect(page.getByText('Never opened')).toBeVisible()
})

test('follows the system colour scheme by default', async ({ browser }) => {
  const context = await browser.newContext({ colorScheme: 'dark' })
  const page = await context.newPage()
  await page.goto('/newtab.html')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await context.close()
})

for (const scheme of ['light', 'dark'] as const) {
  test(`no accessibility violations on any view (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' })
    await page.reload()
    for (const view of ['Home', 'Tasks', 'Insights', 'Settings']) {
      await page.getByRole('button', { name: view, exact: true }).click()
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      const { violations } = await new AxeBuilder({ page }).analyze()
      expect(violations.map((v) => `${view}: ${v.id} (${v.nodes.length}) ${v.nodes[0]?.html.slice(0, 120)}`)).toEqual([])
    }
    await page.getByRole('button', { name: 'Home', exact: true }).click()
    await page.keyboard.press('/')
    await page.getByRole('combobox').fill('sql')
    const { violations } = await new AxeBuilder({ page }).analyze()
    expect(violations.map((v) => `palette: ${v.id} ${v.nodes[0]?.html.slice(0, 120)}`)).toEqual([])
  })
}

test('stays fast with 5000 bookmarks', async ({ page }) => {
  await page.goto('/newtab.html?n=5000')
  await expect(page.getByRole('button', { name: 'Search 5,000 bookmarks' })).toBeVisible()
  // Virtualised folders keep the DOM small no matter how many bookmarks there are.
  expect(await page.locator('li a[href]').count()).toBeLessThan(2500)
  await page.keyboard.press('/')
  const input = page.getByRole('combobox')
  const start = Date.now()
  await input.fill('4321')
  await expect(page.getByRole('option').first()).toContainText('4321')
  expect(Date.now() - start).toBeLessThan(1000)
})

test('a bookmark can be removed and the removal undone', async ({ page }) => {
  await openFolder(page, 'Tools')
  const link = page.getByRole('link', { name: 'Excalidraw', exact: true })
  await page.getByRole('listitem').filter({ has: page.getByRole('link', { name: 'Excalidraw', exact: true }) }).first().hover()
  await page.getByRole('button', { name: 'Pin Excalidraw' }).click()
  await expect(link).toHaveCount(2) // in its folder and in favourites
  await page.getByRole('listitem').filter({ has: page.getByRole('link', { name: 'Excalidraw', exact: true }) }).first().hover()
  await page.getByRole('button', { name: 'Remove Excalidraw' }).click()
  await expect(link).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Search 57 bookmarks' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Folders' })).toBeVisible()
  await expect(link).toHaveCount(0)
  await openFolder(page, 'Tools')

  await page.getByRole('listitem').filter({ has: page.getByRole('link', { name: 'regex101', exact: true }) }).first().hover()

  await page.getByRole('button', { name: 'Remove regex101' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Removed “regex101”' })).toBeVisible()
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(page.getByRole('link', { name: 'regex101', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Search 57 bookmarks' })).toBeVisible()
})

test('appearance settings change the page and survive a reload', async ({ page }) => {
  const html = page.locator('html')
  const accent = () => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim())
  await page.getByRole('button', { name: 'Settings', exact: true }).click()

  // Theme changes are animated, so the new colours land a frame or two after the click.
  await page.getByRole('radio', { name: 'Ocean' }).click()
  await expect.poll(accent).toBe('#1d5fbf')
  await page.getByRole('radio', { name: 'Accent #c02a4b' }).click()
  await expect.poll(accent).toBe('#c02a4b')

  for (const [name, attribute, value] of [
    ['Aurora', 'data-bg', 'aurora'],
    ['Glass', 'data-cards', 'glass'],
    ['Extra round', 'data-radius', 'soft'],
    ['Mono', 'data-font', 'mono'],
    ['Lively', 'data-motion', 'lively'],
  ]) {
    await page.getByRole('radio', { name, exact: true }).click()
    await expect(html).toHaveAttribute(attribute, value)
  }
  await page.getByRole('radio', { name: 'Compact' }).click()
  await page.getByLabel('Your name in the greeting').fill('Sam')
  await page.getByRole('switch', { name: 'Show a clock' }).click()
  await page.getByRole('switch', { name: 'Show favourites row' }).click()

  await page.reload()
  await page.getByRole('button', { name: 'Home', exact: true }).click()
  await expect(html).toHaveAttribute('data-bg', 'aurora')
  await expect(html).toHaveAttribute('data-cards', 'glass')
  expect(await accent()).toBe('#c02a4b')
  await expect(page.getByRole('heading', { level: 1 })).toContainText(', Sam')
  await expect(page.getByText(/^\d{1,2}:\d{2}/)).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Favourites' })).toHaveCount(0)
  // Compact rows are shorter, and glass cards are translucent with a blur behind them.
  // offsetHeight is the laid-out height, unaffected by the entrance animation's scaling.
  await openFolder(page, 'Bookmarks bar')
  expect(await page.getByRole('listitem').filter({ has: page.getByRole('link', { name: 'Hacker News', exact: true }) }).evaluate((el) => (el as HTMLElement).offsetHeight)).toBe(28)
  await openFolder(page, 'Databases')
  const card = page.getByRole('region', { name: 'Databases' })
  expect(await card.evaluate((el) => getComputedStyle(el).backdropFilter)).toContain('blur')
  expect(await page.getByRole('heading', { level: 1 }).evaluate((el) => getComputedStyle(el).fontFamily)).toContain('monospace')
})

test('a background picture can be chosen and is kept on the device', async ({ page }) => {
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByLabel('Background picture').setInputFiles('public/icons/128.png')
  await expect(page.locator('html')).toHaveAttribute('data-bg', 'image')
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--bg-image'))).toContain('data:image/jpeg')
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-bg', 'image')
  await page.getByRole('button', { name: 'Remove picture' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-bg', 'glow')
  expect(await page.evaluate(() => localStorage.getItem('homebase:background-image'))).toBeNull()
})

// Every colour theme, in both modes and on the most demanding backgrounds, must keep readable contrast.
for (const palette of ['paper', 'ocean', 'forest', 'rose', 'sunset', 'lavender', 'neon', 'graphite', 'midnight', 'ember', 'matcha', 'sakura', 'arctic', 'mocha', 'cosmos', 'citrus', 'black']) {
  test(`theme ${palette} passes the accessibility audit`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    for (const theme of ['light', 'dark']) {
      for (const background of ['gradient', 'aurora', 'stars']) {
        await page.evaluate((settings) => localStorage.setItem('homebase:settings', JSON.stringify(settings)), { theme, palette, background })
        await page.reload()
        await expect(page.getByRole('heading', { name: 'Folders' })).toBeVisible()
        const { violations } = await new AxeBuilder({ page }).analyze()
        expect(violations.map((v) => `${theme}/${background}: ${v.id} ${v.nodes[0]?.html.slice(0, 140)}`)).toEqual([])
      }
    }
  })
}
