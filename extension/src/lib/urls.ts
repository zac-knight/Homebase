// URL canonicalisation. Mirrors backend/app/pipeline/urls.py; keep the two in step.

const TRACKING_PARAMS = new Set([
  'fbclid', 'gclid', 'dclid', 'gbraid', 'wbraid', 'msclkid', 'mc_cid', 'mc_eid', 'igshid',
  'ref_src', 'ref_url', '_hsenc', '_hsmi', 'yclid', 'si', 'spm', 'mkt_tok', 's_cid',
]) // prettier-ignore

export function isWebUrl(url: string): boolean {
  return /^https?:\/\//i.test(url)
}

/** Normalised form used to spot exact duplicates and as the bookmark's identity on the server. */
export function canonicalise(raw: string): string {
  let u: URL
  try {
    u = new URL(raw.trim())
  } catch {
    return raw.trim()
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return raw.trim()
  let host = u.hostname.toLowerCase().replace(/\.$/, '')
  if (host.startsWith('www.')) host = host.slice(4)
  if (u.port) host += `:${u.port}`
  const path = u.pathname.replace(/\/{2,}/g, '/').replace(/\/+$/, '')
  const params = [...u.searchParams.entries()]
    .filter(([k]) => !k.toLowerCase().startsWith('utm_') && !TRACKING_PARAMS.has(k.toLowerCase()))
    .sort(([a, av], [b, bv]) => (a === b ? (av < bv ? -1 : av > bv ? 1 : 0) : a < b ? -1 : 1))
  const query = new URLSearchParams(params).toString()
  const fragment = u.hash.startsWith('#/') || u.hash.startsWith('#!') ? u.hash : ''
  return `https://${host}${path}${query ? `?${query}` : ''}${fragment}`.slice(0, 2000)
}

export function domainOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    return ''
  }
}
