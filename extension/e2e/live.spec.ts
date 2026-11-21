import { expect, test } from '@playwright/test'

// Full-stack check: the page signs in to a real API, syncs, searches by meaning and asks a question.
//   cd backend && HOMEBASE_DEV_AUTH=true HOMEBASE_DATABASE_URL=sqlite:///./live.db uv run uvicorn app.main:app --port 8765
//   cd extension && HOMEBASE_API=http://localhost:8765 npm run e2e -- live
// Set HOMEBASE_SHOTS=../docs/assets/screenshots to also refresh the search and insights screenshots
// (the others come from e2e/screenshots.spec.ts, which needs no server).
const api = process.env.HOMEBASE_API
const shots = process.env.HOMEBASE_SHOTS

test('syncs with a running server and uses its search and answers', async ({ page }) => {
  test.skip(!api, 'set HOMEBASE_API to run against a live server')
  const shot = async (name: string, fullPage = false) => {
    if (shots) await page.waitForTimeout(400) // let hover and colour transitions settle
    if (shots) await page.screenshot({ path: `${shots}/${name}.png`, fullPage })
  }
  await page.setViewportSize({ width: 1360, height: 900 })
  await page.goto('/newtab.html')
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByRole('switch', { name: 'Sync with a Homebase server' }).click()
  await page.getByLabel('Server address').fill(api!)
  await page.getByLabel('Email for development sign in').fill(`e2e-${Date.now()}@example.com`)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByText(/Last sync .*Sent 58 bookmark changes/)).toBeVisible({ timeout: 60_000 })
  await page.getByRole('button', { name: 'Sync now' }).click()
  await expect(page.getByText(/Already up to date/)).toBeVisible()

  await page.getByRole('button', { name: 'Home', exact: true }).click()
  await page.keyboard.press('/')
  await page.getByRole('combobox', { name: 'Search bookmarks or the web' }).fill('that article on how attention works')
  await expect(page.getByText('Found by meaning')).toBeVisible({ timeout: 60_000 })
  await expect(page.getByRole('listbox', { name: 'Results' }).getByRole('option').first()).toContainText(/Transformer|Attention/)
  await page.getByRole('option', { name: /Ask your bookmarks/ }).click()
  await expect(page.getByText('From your bookmarks')).toBeVisible({ timeout: 30_000 })
  await shot('search')

  await page.getByRole('combobox', { name: 'Search bookmarks or the web' }).fill('xylophone quokka zeppelin')
  await page.getByRole('option', { name: /Ask your bookmarks/ }).click()
  await expect(page.getByText('Nothing in your bookmarks looks relevant')).toBeVisible()
  await expect(page.getByText('Found by meaning')).toBeHidden()
  await page.keyboard.press('Escape')

  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await page.getByRole('radio', { name: 'dark' }).click()
  await page.getByRole('button', { name: 'Insights', exact: true }).click()
  await expect(page.getByText('Not checked yet')).toBeVisible()
  await page.waitForTimeout(300)
  await shot('insights', true)
  await page.getByRole('button', { name: 'Home', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Folders' })).toBeAttached()
  await expect(page.getByRole('button', { name: 'Home', exact: true })).toHaveAttribute('aria-current', 'page')
})
