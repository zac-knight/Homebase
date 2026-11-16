// One wavelength is 600 units; the path holds two, and the layer is drawn twice as wide as the
// screen, so sliding it by half its width moves exactly one wavelength.
const WAVE = 'M0 70 Q150 0 300 70 T600 70 T900 70 T1200 70 V200 H0 Z'

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
