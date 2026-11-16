import { defineConfig } from '@playwright/test'

// Runs against the production build in demo mode (no chrome.* APIs, sample bookmarks).
export default defineConfig({
  testDir: 'e2e',
  reporter: 'list',
  use: { baseURL: 'http://localhost:4173' },
  webServer: { command: 'npm run preview', url: 'http://localhost:4173/newtab.html', reuseExistingServer: !process.env.CI },
})
