import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { type Page, expect, test } from '@playwright/test'

// Refreshes the README pictures from the demo library, so nothing private can end up in them.
// It does nothing unless HOMEBASE_SHOTS names a folder:
//   cd extension && npm run build && HOMEBASE_SHOTS=../docs/assets/screenshots npm run e2e -- screenshots
// The search and insights pictures need a server and come from e2e/live.spec.ts. The animated
// demo needs ffmpeg.
const out = process.env.HOMEBASE_SHOTS
const library: { title: string }[] = JSON.parse(readFileSync(join(import.meta.dirname, '../../sample-data/bookmarks.json'), 'utf8'))
const idOf = (title: string) => `d${library.findIndex((b) => b.title === title)}`
const FAVOURITES = ['Excalidraw', 'Hacker News', 'TypeScript Handbook', 'PostgreSQL documentation: Indexes', 'The Illustrated Transformer']

const day = (offset: number) => {
  const d = new Date(Date.now() + offset * 86_400_000)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const TASKS = [
  { text: 'Finish the indexing chapter and note three questions', done: false, due: day(0) },
  { text: 'Send the draft report to the group', done: false, due: day(1) },
  { text: 'Try the pgvector example from the docs', done: false, due: day(3) },
  { text: 'Renew the library books', done: false, due: day(-1) },
  { text: 'Tidy the reading list', done: false, due: null },
  { text: 'Book train tickets', done: true, due: null },
  { text: 'Read the Transformer article', done: true, due: null },
].map((t, i) => ({ id: `t${i}`, createdAt: 1_700_000_000_000 + i, ...t }))

/** Seeds what the page keeps in localStorage in demo mode, before it loads. */
async function seed(page: Page, settings: Record<string, unknown> = {}) {
  const favourites = FAVOURITES.map(idOf)
  await page.addInitScript(
    ({ favourites, settings, tasks }) => {
      localStorage.setItem('homebase:favourites', JSON.stringify(favourites))
      localStorage.setItem('homebase:settings', JSON.stringify(settings))
      localStorage.setItem('homebase:tasks', JSON.stringify(tasks))
    },
    { favourites, settings, tasks: TASKS },
  )
}

async function settle(page: Page, folder = 'Dev') {
  await page.goto('/newtab.html')
  await page.getByRole('region', { name: 'Folders' }).getByRole('button', { name: new RegExp(`^${folder}\\b`) }).click()
  await page.mouse.move(0, 0)
  await page.waitForTimeout(900) // entrance animations and colour transitions
}

test.describe('README pictures', () => {
  test.skip(!out, 'set HOMEBASE_SHOTS to a folder to refresh the README pictures')
  test.use({ viewport: { width: 1440, height: 900 } })

  for (const scheme of ['light', 'dark'] as const) {
    test(`home (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme })
      await seed(page)
      await settle(page, 'Machine learning')
      await page.screenshot({ path: `${out}/${scheme === 'dark' ? 'home-dark' : 'home'}.png` })
    })
  }

  test('tasks', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' })
    await seed(page)
    await page.goto('/newtab.html#tasks')
    await expect(page.getByRole('heading', { name: 'Tasks', level: 1 })).toBeVisible()
    await page.mouse.move(0, 0)
    await page.waitForTimeout(900)
    await page.screenshot({ path: `${out}/tasks.png` })
  })

  const looks: [string, Record<string, unknown>][] = [
    ['neon', { theme: 'dark', palette: 'neon', background: 'aurora', cardStyle: 'glass', radius: 'rounded', font: 'rounded', showClock: true }],
    ['ocean', { theme: 'light', palette: 'ocean', background: 'gradient', cardStyle: 'glass', radius: 'rounded', font: 'modern' }],
    ['sunset', { theme: 'dark', palette: 'sunset', background: 'dots', cardStyle: 'outline', radius: 'sharp', font: 'mono', density: 'compact' }],
    ['blossom', { theme: 'light', palette: 'sakura', background: 'aurora', cardStyle: 'glass', radius: 'soft', font: 'editorial' }],
    ['stargazer', { theme: 'dark', palette: 'cosmos', background: 'stars', cardStyle: 'glass', radius: 'rounded', font: 'rounded' }],
    ['teahouse', { theme: 'light', palette: 'matcha', background: 'dots', cardStyle: 'outline', radius: 'sharp', font: 'editorial' }],
  ]
  for (const [name, settings] of looks) {
    test(`theme ${name}`, async ({ page }) => {
      await seed(page, settings)
      await settle(page, name === 'sunset' ? 'Tools' : 'Reading')
      await page.screenshot({ path: `${out}/theme-${name}.png` })
    })
  }

  test('animated demo', async ({ browser }) => {
    test.setTimeout(120_000)
    const dir = join(out!, '.video')
    mkdirSync(dir, { recursive: true })
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, colorScheme: 'dark', recordVideo: { dir, size: { width: 1280, height: 800 } } })
    const page = await context.newPage()
    await seed(page, { theme: 'dark', palette: 'midnight', background: 'aurora', cardStyle: 'glass' })
    await page.goto('/newtab.html')
    const folders = page.getByRole('region', { name: 'Folders' })
    await page.waitForTimeout(1400)
    for (const name of ['Databases', 'Dev', 'Machine learning']) {
      await folders.getByRole('button', { name: new RegExp(`^${name}\\b`) }).click()
      await page.waitForTimeout(1100)
    }
    await page.keyboard.press('/')
    await page.keyboard.type('postgres index', { delay: 90 })
    await page.waitForTimeout(1500)
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Tasks', exact: true }).click()
    await page.waitForTimeout(900)
    await page.getByLabel('New task').pressSequentially('Ship the README', { delay: 70 })
    await page.keyboard.press('Enter')
    await page.waitForTimeout(1200)
    await page.getByRole('checkbox', { name: /Mark “Ship the README” done/ }).click()
    await page.waitForTimeout(1000)
    await page.getByRole('button', { name: 'Home', exact: true }).click()
    await page.waitForTimeout(1200)
    const video = page.video()!
    await context.close()
    const webm = await video.path()
    // Small on purpose: 8 frames a second, 720 pixels wide, 48 colours keeps the file small.
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', webm, '-vf', 'fps=8,scale=720:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=48:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle', `${out}/demo.gif`])
    rmSync(dir, { recursive: true, force: true })
  })
})
