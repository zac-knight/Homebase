import { useEffect, useRef, useState } from 'react'
import { kv } from '../lib/platform'
import { Icon } from './ui'

/** One persistent scratchpad: whatever you are juggling today. Saved as you type, kept on this device. */
export function Note({ index = 0 }: { index?: number }) {
  const [text, setText] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [saved, setSaved] = useState(true)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const latest = useRef('')
  // Only text you typed is ever written back, so loading and leaving can never blank a saved note.
  const dirty = useRef(false)

  useEffect(() => {
    void kv.get('note', '').then((value) => {
      if (!dirty.current) {
        latest.current = value
        setText(value)
      }
      setLoaded(true)
    })
    // Leaving the page mid-edit must not lose the last few keystrokes.
    return () => {
      clearTimeout(timer.current)
      if (dirty.current) void kv.set('note', latest.current)
    }
  }, [])

  function change(value: string) {
    setText(value)
    latest.current = value
    dirty.current = true
    setSaved(false)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => void kv.set('note', value).then(() => { dirty.current = false; setSaved(true) }), 400)
  }

  return (
    <section aria-labelledby="note-heading" style={{ '--i': index } as React.CSSProperties} className="enter surface flex flex-col rounded-2xl border border-line bg-card p-3.5">
      <div className="mb-1.5 flex items-center justify-between">
        <h2 id="note-heading" className="flex items-center gap-2 text-xs font-semibold tracking-wide text-muted uppercase">
          <Icon name="edit" className="size-3.5" />
          Scratchpad
        </h2>
        <span aria-live="polite" className="text-[11px] text-muted">{loaded && (saved ? (text ? 'Saved' : '') : 'Saving…')}</span>
      </div>
      <textarea
        aria-label="Scratchpad"
        value={text}
        maxLength={5000}
        disabled={!loaded}
        placeholder="What are you juggling today?"
        onChange={(e) => change(e.target.value)}
        // Typing here must not trigger the page's "/" search shortcut or drag keys.
        onKeyDown={(e) => e.stopPropagation()}
        className="min-h-[4.5rem] max-h-32 w-full resize-none bg-transparent text-sm leading-relaxed outline-none [field-sizing:content] placeholder:text-muted"
      />
    </section>
  )
}
