import { useState } from 'react'

// One wavelength is 600 units; the path holds two, and the layer is drawn twice as wide as the
// screen, so sliding it by half its width moves exactly one wavelength.
const WAVE = 'M0 70 Q150 0 300 70 T600 70 T900 70 T1200 70 V200 H0 Z'

/** True when the opening sequence should play: not with motion off or reduced motion asked for. */
export const introWanted = () => document.documentElement.dataset.motion !== 'off' && !window.matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * The opening: three layers of wave swell up from the bottom over a clear screen, then the whole
 * veil fades away into the page behind it. It removes itself when finished.
 */
export function WaveIntro() {
  const [done, setDone] = useState(false)
  if (done) return null
  return (
    <div aria-hidden="true" className="intro" onAnimationEnd={(e) => e.target === e.currentTarget && setDone(true)}>
      {[1, 2, 3].map((n) => (
        <div key={n} className={`intro-layer intro-layer-${n}`}>
          <svg className={`wave wave-${n}`} viewBox="0 0 1200 200" preserveAspectRatio="none">
            <path d={WAVE} />
          </svg>
        </div>
      ))}
    </div>
  )
}

export function Waves() {
  return (
    <div aria-hidden="true" className="waves">
      {[1, 2, 3].map((n) => (
        <svg key={n} className={`wave wave-${n}`} viewBox="0 0 1200 200" preserveAspectRatio="none">
          <path d={WAVE} />
        </svg>
      ))}
    </div>
  )
}
