// Client for the optional Homebase server. Nothing in here runs unless sync is turned on.

import { kv } from './platform'
import { getSettings } from './store'

interface Tokens {
  access_token: string
  refresh_token: string
  email: string
}

export const getAuth = () => kv.get<Tokens | null>('auth', null)
export const signOut = () => kv.set('auth', null)

function base(serverUrl: string): string {
  return serverUrl.replace(/\/+$/, '')
}

async function post<T>(serverUrl: string, path: string, body: unknown): Promise<T> {
  const r = await fetch(base(serverUrl) + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  if (!r.ok) throw new Error(`${path} failed (${r.status})`)
  return (await r.json()) as T
}

export async function health(serverUrl: string): Promise<{ ok: boolean; dev_auth: boolean; google_sign_in: boolean }> {
  const r = await fetch(base(serverUrl) + '/health')
  if (!r.ok) throw new Error(`Server answered ${r.status}`)
  return r.json()
}

export async function signInDev(serverUrl: string, email: string): Promise<Tokens> {
  const tokens = await post<Tokens>(serverUrl, '/auth/dev', { email })
  await kv.set('auth', tokens)
  return tokens
}

export async function signInGoogle(serverUrl: string, clientId: string): Promise<Tokens> {
  if (!(await chrome.permissions.request({ permissions: ['identity'] }))) throw new Error('Sign in needs the identity permission')
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'id_token',
    redirect_uri: chrome.identity.getRedirectURL(),
    scope: 'openid email',
    nonce: crypto.randomUUID(),
  })
  const redirect = await chrome.identity.launchWebAuthFlow({ url: `https://accounts.google.com/o/oauth2/v2/auth?${params}`, interactive: true })
  const idToken = redirect ? new URLSearchParams(new URL(redirect).hash.slice(1)).get('id_token') : null
  if (!idToken) throw new Error('Google did not return an ID token')
  const tokens = await post<Tokens>(serverUrl, '/auth/google', { id_token: idToken })
  await kv.set('auth', tokens)
  return tokens
}

/** Authenticated request. Access tokens are short lived, so a 401 triggers one refresh and retry. */
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { serverUrl, syncEnabled } = await getSettings()
  let auth = await getAuth()
  if (!syncEnabled || !auth) throw new Error('Not signed in')
  const call = (token: string) =>
    fetch(base(serverUrl) + path, { ...init, headers: { 'Content-Type': 'application/json', ...init.headers, Authorization: `Bearer ${token}` } })
  let r = await call(auth.access_token)
  if (r.status === 401) {
    try {
      auth = { ...auth, ...(await post<Tokens>(serverUrl, '/auth/refresh', { refresh_token: auth.refresh_token })) }
    } catch {
      await signOut()
      throw new Error('Session expired. Sign in again.')
    }
    await kv.set('auth', auth)
    r = await call(auth.access_token)
  }
  if (!r.ok) throw new Error(`${path} failed (${r.status})`)
  return (await r.json()) as T
}

export interface ServerResult {
  url: string
  title: string
  folder: string
}

export interface AskResponse {
  grounded: boolean
  answer: string | null
  message?: string
  sources: (ServerResult & { n: number; excerpt: string })[]
}

export const searchServer = (q: string, signal?: AbortSignal) =>
  apiFetch<{ results: ServerResult[] }>(`/search?q=${encodeURIComponent(q)}&limit=8`, { signal })
export const askServer = (question: string) => apiFetch<AskResponse>('/ask', { method: 'POST', body: JSON.stringify({ question }) })
