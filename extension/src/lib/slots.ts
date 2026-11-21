// The folder grid is a row-major list of numbered slots. A folder lives in one slot; empty slots
// are places a folder can be dropped. These helpers are pure so the rules can be tested.

export type Slots = Record<string, number>

/**
 * A slot for every folder. Saved positions are kept when they are still valid; folders without
 * one (new, or never moved) fill the first free slots in the order given.
 */
export function assignSlots(ids: string[], saved: Slots): Slots {
  const out: Slots = {}
  const taken = new Set<number>()
  for (const id of ids) {
    const slot = saved[id]
    if (Number.isInteger(slot) && slot >= 0 && !taken.has(slot)) {
      out[id] = slot
      taken.add(slot)
    }
  }
  let next = 0
  for (const id of ids) {
    if (id in out) continue
    while (taken.has(next)) next++
    out[id] = next
    taken.add(next)
  }
  return out
}

/** Dropping on an empty slot moves the folder there; dropping on an occupied one swaps the two. */
export function moveToSlot(slots: Slots, id: string, target: number): Slots {
  const from = slots[id]
  if (from === undefined || from === target) return slots
  const occupant = Object.keys(slots).find((other) => slots[other] === target)
  return { ...slots, [id]: target, ...(occupant ? { [occupant]: from } : {}) }
}

/** First slot nobody is using. */
export function firstFreeSlot(slots: Slots): number {
  const taken = new Set(Object.values(slots))
  let n = 0
  while (taken.has(n)) n++
  return n
}

/** How many slots to draw: whole rows, at least two, always with room left over. */
export function slotCount(slots: Slots, columns: number): number {
  const highest = Math.max(-1, ...Object.values(slots))
  const rows = Math.max(2, Math.ceil((highest + 2) / columns))
  return rows * columns
}
