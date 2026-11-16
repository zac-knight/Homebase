import { flushSync } from 'react-dom'

const reduce = window.matchMedia('(prefers-reduced-motion: reduce)')

export const motionOn = () => document.documentElement.dataset.motion !== 'off' && !reduce.matches

let latest = 0

/**
 * Runs a state change inside a view transition so the browser animates between the two states:
 * `nav` slides the page content, `theme` wipes the new colours in as a circle growing from the
 * control that was used, `fade` cross-fades. With motion off the change just happens.
 */
export function withTransition(kind: 'nav' | 'theme' | 'fade', update: () => void): void {
  if (!motionOn() || typeof document.startViewTransition !== 'function') return update()
  const root = document.documentElement
  if (kind === 'theme') {
    const from = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement.getBoundingClientRect() : null
    root.style.setProperty('--vx', `${from ? from.left + from.width / 2 : window.innerWidth / 2}px`)
    root.style.setProperty('--vy', `${from ? from.top + from.height / 2 : window.innerHeight / 2}px`)
  }
  const id = ++latest
  root.dataset.vt = kind
  const transition = document.startViewTransition(() => flushSync(update))
  transition.ready.catch(() => {}) // skipped because a newer one started: nothing to do
  void transition.finished.finally(() => {
    if (id === latest) delete root.dataset.vt
  })
}

/**
 * Tells each card where the pointer is over it, as CSS variables: --mx/--my in pixels for the
 * light that follows the pointer, --tx/--ty from -0.5 to 0.5 for the lean on hover.
 */
export function trackPointer(): void {
  window.addEventListener(
    'pointermove',
    (e) => {
      if (!motionOn() || !(e.target instanceof Element)) return
      const el = e.target.closest<HTMLElement>('.surface')
      if (!el) return
      const r = el.getBoundingClientRect()
      const x = e.clientX - r.left
      const y = e.clientY - r.top
      el.style.setProperty('--mx', `${x.toFixed(0)}px`)
      el.style.setProperty('--my', `${y.toFixed(0)}px`)
      el.style.setProperty('--tx', (x / r.width - 0.5).toFixed(2))
      el.style.setProperty('--ty', (y / r.height - 0.5).toFixed(2))
    },
    { passive: true },
  )
}
