import { useState } from 'react'
import type { Task } from '../lib/types'
import { Icon } from './ui'

const todayKey = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function dueLabel(due: string, today: string): { text: string; late: boolean } {
  const days = Math.round((new Date(`${due}T00:00`).getTime() - new Date(`${today}T00:00`).getTime()) / 86_400_000)
  if (days < 0) return { text: days === -1 ? 'Yesterday' : `${-days} days overdue`, late: true }
  if (days === 0) return { text: 'Today', late: false }
  if (days === 1) return { text: 'Tomorrow', late: false }
  if (days < 7) return { text: new Date(`${due}T00:00`).toLocaleDateString(undefined, { weekday: 'long' }), late: false }
  return { text: new Date(`${due}T00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }), late: false }
}

/** Open tasks first, soonest due date at the top, undated ones after. */
const byUrgency = (a: Task, b: Task) => (a.due ?? '9999').localeCompare(b.due ?? '9999') || a.createdAt - b.createdAt

export function Tasks({ tasks, onChange }: { tasks: Task[]; onChange: (tasks: Task[]) => void }) {
  const [text, setText] = useState('')
  const [due, setDue] = useState('')
  const today = todayKey()
  const open = tasks.filter((t) => !t.done).sort(byUrgency)
  const done = tasks.filter((t) => t.done)

  function add(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = text.trim()
    if (!trimmed) return
    onChange([...tasks, { id: crypto.randomUUID(), text: trimmed, done: false, due: due || null, createdAt: Date.now() }])
    setText('')
    setDue('')
  }
  const update = (id: string, patch: Partial<Task>) => onChange(tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)))

  return (
    <div className="max-w-3xl space-y-8">
      <form onSubmit={add} className="surface glow-ring flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-card p-2 shadow-soft">
        <label className="sr-only" htmlFor="new-task">
          New task
        </label>
        <input id="new-task" value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a task, then press Enter" maxLength={200} className="h-11 min-w-0 flex-1 basis-60 bg-transparent px-3 text-[15px] outline-none placeholder:text-muted" />
        <label className="sr-only" htmlFor="new-task-due">
          Due date
        </label>
        <input id="new-task-due" type="date" value={due} onChange={(e) => setDue(e.target.value)} className="h-10 rounded-lg border border-line bg-bg px-2 text-sm text-muted" />
        <button type="submit" className="flex h-10 items-center gap-1.5 rounded-xl bg-accent px-4 text-sm font-medium text-accent-ink">
          <Icon name="plus" className="size-4" /> Add
        </button>
      </form>

      <section aria-labelledby="open-tasks">
        <h2 id="open-tasks" className="section-title mb-3 text-xs font-semibold tracking-wide text-muted uppercase">
          To do · {open.length}
        </h2>
        {open.length === 0 ? (
          <p className="text-sm text-muted">Nothing to do. Add something above.</p>
        ) : (
          <ul className="space-y-2">
            {open.map((t, i) => {
              const label = t.due ? dueLabel(t.due, today) : null
              return (
                <li key={t.id} className="surface rise group flex items-center gap-3 rounded-2xl border border-line bg-card py-2 pr-2 pl-3" style={{ '--i': i } as React.CSSProperties}>
                  <button type="button" role="checkbox" aria-checked={false} aria-label={`Mark “${t.text}” done`} onClick={() => update(t.id, { done: true })} className="grid size-6 shrink-0 place-items-center rounded-full border-2 border-line text-transparent hover:border-accent hover:text-accent">
                    <Icon name="check" className="size-3.5" />
                  </button>
                  <span className="min-w-0 flex-1 text-[15px] break-words">{t.text}</span>
                  {label && <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${label.late ? 'bg-danger/15 text-danger' : 'bg-accent-soft text-ink'}`}>{label.text}</span>}
                  <button type="button" aria-label={`Delete “${t.text}”`} onClick={() => onChange(tasks.filter((x) => x.id !== t.id))} className="grid size-8 shrink-0 place-items-center rounded-lg text-muted opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 hover:bg-hover hover:text-danger">
                    <Icon name="trash" className="size-4" />
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {done.length > 0 && (
        <section aria-labelledby="done-tasks">
          <div className="mb-3 flex items-center justify-between">
            <h2 id="done-tasks" className="section-title text-xs font-semibold tracking-wide text-muted uppercase">
              Done · {done.length}
            </h2>
            <button type="button" onClick={() => onChange(tasks.filter((t) => !t.done))} className="rounded-lg px-2 py-1 text-xs text-muted hover:bg-hover hover:text-ink">
              Clear done
            </button>
          </div>
          <ul className="space-y-1">
            {done.map((t) => (
              <li key={t.id} className="flex items-center gap-3 rounded-xl py-1.5 pr-2 pl-3 text-muted">
                <button type="button" role="checkbox" aria-checked aria-label={`Mark “${t.text}” not done`} onClick={() => update(t.id, { done: false })} className="grid size-6 shrink-0 place-items-center rounded-full bg-accent text-accent-ink">
                  <Icon name="check" className="size-3.5" />
                </button>
                <span className="min-w-0 flex-1 text-sm break-words line-through">{t.text}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
