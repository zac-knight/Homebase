/**
 * Injected into the page you just bookmarked (only when "capture page text" is on) to pull out
 * its description and main text. Must be self-contained: chrome.scripting serialises the
 * function, so it cannot reference anything outside its own body.
 */
export function extractPageText(): { description: string; text: string } {
  const meta = document.querySelector('meta[name="description"], meta[property="og:description"]')
  const root = document.querySelector('article, main, [role="main"]') ?? document.body
  const parts: string[] = []
  root.querySelectorAll('p, h1, h2, h3, li, blockquote').forEach((el) => {
    if (el.closest('nav, footer, header, aside, form')) return
    const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim()
    if (text.length > 30) parts.push(text)
  })
  return { description: (meta?.getAttribute('content') ?? '').trim().slice(0, 500), text: parts.join('\n').slice(0, 4000) }
}
