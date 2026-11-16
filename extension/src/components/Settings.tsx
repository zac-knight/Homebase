import { useEffect, useState } from 'react'
import { apiFetch, getAuth, health, signInDev, signInGoogle, signOut } from '../lib/api'
import { isExtension, kv, loadBookmarks } from '../lib/platform'
import { getEvents, getFavourites, getSettings } from '../lib/store'
import { type SyncStatus, resetSyncState, runSync } from '../lib/sync'
import type { Settings as SettingsType } from '../lib/types'
import { Appearance } from './Appearance'
import { Card, Toggle } from './ui'

const input = 'h-9 w-full rounded-lg border border-line bg-bg px-3 text-sm'
const button = 'h-9 rounded-lg border border-line bg-card px-3 text-sm font-medium hover:bg-hover disabled:opacity-50'
const primary = 'h-9 rounded-lg bg-accent px-3 text-sm font-medium text-accent-ink disabled:opacity-50'

const PERMISSIONS = [
  ['Bookmarks', 'Always on', 'To show your bookmarks on the new tab page, and to delete one when you press its remove button. Homebase never changes them on its own.'],
  ['Storage', 'Always on', 'To keep your settings, favourites and usage log on this device.'],
  ['Favicons', 'Always on', 'To show site icons from Chrome’s own cache, without contacting any website.'],
  ['Alarms', 'Always on', 'To run sync and link checks in the background when you have turned sync on.'],
  ['Read pages you bookmark', 'Only if you turn on page text capture', 'To copy the main text of a page at the moment you bookmark it, so search can work on meaning.'],
  ['Browsing history', 'Only if you turn it on', 'To tell which saved pages you have actually visited. History stays on this device and is never synced.'],
  ['Identity', 'Only when you sign in with Google', 'To open Google’s sign-in window.'],
]

export function Settings({ settings, onChange, onDataDeleted }: { settings: SettingsType; onChange: (patch: Partial<SettingsType>) => void; onDataDeleted: () => void }) {
  const [email, setEmail] = useState<string | null>(null)
  const [devEmail, setDevEmail] = useState('')
  const [server, setServer] = useState<{ dev_auth: boolean; google_sign_in: boolean } | 'unreachable' | null>(null)
  const [status, setStatus] = useState<SyncStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    void getAuth().then((a) => setEmail(a?.email ?? null))
    void kv.get<SyncStatus | null>('syncStatus', null).then(setStatus)
  }, [])

  useEffect(() => {
    if (!settings.syncEnabled) return
    let stale = false
    health(settings.serverUrl)
      .then((h) => !stale && setServer(h))
      .catch(() => !stale && setServer('unreachable'))
    return () => {
      stale = true
    }
  }, [settings.syncEnabled, settings.serverUrl])

  async function run(task: () => Promise<void>) {
    setBusy(true)
    setNotice('')
    try {
      await task()
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  const syncNow = () => run(async () => setStatus(await runSync()))

  const signIn = (method: 'dev' | 'google') =>
    run(async () => {
      const tokens = method === 'dev' ? await signInDev(settings.serverUrl, devEmail) : await signInGoogle(settings.serverUrl, settings.googleClientId)
      setEmail(tokens.email)
      await resetSyncState()
      setStatus(await runSync())
      onChange({}) // reloads app state so search and Insights pick up the signed-in server
    })

  async function requestThen(permissions: chrome.permissions.Permissions, patch: Partial<SettingsType>, enable: boolean) {
    if (enable && isExtension && !(await chrome.permissions.request(permissions))) return
    if (!enable && isExtension) await chrome.permissions.remove(permissions).catch(() => false)
    onChange(patch)
  }

  const exportAll = () =>
    run(async () => {
      const [bookmarks, events, favourites, pageText, current] = await Promise.all([loadBookmarks(), getEvents(), getFavourites(), kv.get('pageText', {}), getSettings()])
      const serverCopy = email ? await apiFetch('/export').catch(() => 'unavailable') : 'sync off'
      const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), settings: current, bookmarks, favourites, events, pageText, server: serverCopy }, null, 2)], { type: 'application/json' })
      const link = document.createElement('a')
      link.href = URL.createObjectURL(blob)
      link.download = `homebase-export-${new Date().toISOString().slice(0, 10)}.json`
      link.click()
      URL.revokeObjectURL(link.href)
    })

  const deleteAll = () =>
    run(async () => {
      // Server first: if that fails we stop, so you are never left believing a copy is gone when it is not.
      if (email) await apiFetch('/account', { method: 'DELETE' })
      await kv.clear()
      setConfirmDelete(false)
      onDataDeleted()
    })

  return (
    <div className="columns-1 gap-4 xl:columns-2 [&>*]:mb-4 [&>*]:break-inside-avoid">
      <Appearance settings={settings} onChange={onChange} />

      <Card title="Sync and smart features" aside="off by default">
        <Toggle label="Sync with a Homebase server" description="Sends your bookmark titles, URLs, folders and usage log to the server below, which adds search by meaning, suggested folders, dead link checks and question answering. Without it, everything stays on this device." checked={settings.syncEnabled} onChange={(syncEnabled) => onChange({ syncEnabled })} />
        {settings.syncEnabled && (
          <div className="space-y-3 border-t border-line pt-3">
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Server address</span>
              <input className={input} value={settings.serverUrl} onChange={(e) => onChange({ serverUrl: e.target.value })} spellCheck={false} />
            </label>
            {server === 'unreachable' && <p className="text-sm text-danger">Cannot reach that server.</p>}
            {email ? (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="mr-auto">
                  Signed in as <span className="font-medium">{email}</span>
                </span>
                <button type="button" className={primary} disabled={busy} onClick={syncNow}>Sync now</button>
                <button type="button" className={button} disabled={busy} onClick={() => run(async () => { await signOut(); await resetSyncState(); setEmail(null); setStatus(null); onChange({}) })}>Sign out</button>
              </div>
            ) : (
              <>
                {server && server !== 'unreachable' && server.google_sign_in && (
                  <div className="flex gap-2">
                    <input className={input} aria-label="Google OAuth client ID" placeholder="Google OAuth client ID" value={settings.googleClientId} onChange={(e) => onChange({ googleClientId: e.target.value })} />
                    <button type="button" className={`${primary} shrink-0`} disabled={busy || !isExtension || !settings.googleClientId} onClick={() => signIn('google')}>Sign in with Google</button>
                  </div>
                )}
                {server && server !== 'unreachable' && server.dev_auth && (
                  <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void signIn('dev') }}>
                    <input className={input} type="email" required aria-label="Email for development sign in" placeholder="you@example.com (development sign in)" value={devEmail} onChange={(e) => setDevEmail(e.target.value)} />
                    <button type="submit" className={`${primary} shrink-0`} disabled={busy}>Sign in</button>
                  </form>
                )}
                {server && server !== 'unreachable' && !server.dev_auth && !server.google_sign_in && <p className="text-sm text-muted">This server has no sign-in method configured.</p>}
              </>
            )}
            {status && <p className={`text-sm ${status.ok ? 'text-muted' : 'text-danger'}`}>Last sync {new Date(status.at).toLocaleString()}: {status.message}</p>}
          </div>
        )}
        <div className="divide-y divide-line border-t border-line">
          <Toggle label="Capture page text when I bookmark a page" description={isExtension ? 'Copies the description and main text of the page you are on when you save it. Only sent anywhere if sync is on. Chrome will ask for permission to read pages.' : 'Available in the installed extension.'} disabled={!isExtension} checked={settings.capturePageText} onChange={(on) => requestThen({ permissions: ['scripting'], origins: ['<all_urls>'] }, { capturePageText: on }, on)} />
          <Toggle label="Use browsing history for Insights" description={isExtension ? 'Lets Insights count a bookmark as used if you visited it any other way. History is read on this device and never synced.' : 'Available in the installed extension.'} disabled={!isExtension} checked={settings.useHistory} onChange={(on) => requestThen({ permissions: ['history'] }, { useHistory: on }, on)} />
        </div>
      </Card>

      <Card title="What Homebase can access, and why">
        <ul className="divide-y divide-line text-sm">
          {PERMISSIONS.map(([name, when, why]) => (
            <li key={name} className="py-2.5">
              <div className="flex justify-between gap-4">
                <span className="font-medium">{name}</span>
                <span className="shrink-0 text-xs text-muted">{when}</span>
              </div>
              <p className="mt-0.5 text-muted">{why}</p>
            </li>
          ))}
        </ul>
      </Card>

      <Card title="Your data">
        <p className="mb-3 text-sm text-muted">Export gives you one JSON file with everything Homebase holds{email ? ', including the server copy and its vectors' : ''}. Delete removes Homebase’s settings, favourites, usage log and captured text{email ? ', and your whole server account' : ''}. Your Chrome bookmarks themselves are not touched.</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={button} disabled={busy} onClick={exportAll}>Export everything</button>
          {confirmDelete ? (
            <>
              <button type="button" className="h-9 rounded-lg bg-danger px-3 text-sm font-medium text-card" disabled={busy} onClick={deleteAll}>Yes, delete it all</button>
              <button type="button" className={button} onClick={() => setConfirmDelete(false)}>Cancel</button>
            </>
          ) : (
            <button type="button" className={`${button} text-danger`} onClick={() => setConfirmDelete(true)}>Delete everything</button>
          )}
        </div>
      </Card>
      <p role="status" className="min-h-5 text-sm text-danger">{notice}</p>
    </div>
  )
}
