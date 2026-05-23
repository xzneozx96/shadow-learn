import type { VocabDayGroup } from './vocabGrouping'

export interface PickerInitialState {
  selectedIds: Set<string>
  expandedKeys: Set<string>
}

export type GroupTriState = 'all' | 'some' | 'none'

export function getInitialPickerState(groups: VocabDayGroup[]): PickerInitialState {
  const firstNonEmpty = groups.find(g => g.entries.length > 0)
  if (!firstNonEmpty)
    return { selectedIds: new Set(), expandedKeys: new Set() }
  return {
    selectedIds: new Set(firstNonEmpty.entries.map(e => e.id)),
    expandedKeys: new Set([firstNonEmpty.key]),
  }
}

export function getGroupTriState(group: VocabDayGroup, selectedIds: Set<string>): GroupTriState {
  if (group.entries.length === 0)
    return 'none'
  let count = 0
  for (const entry of group.entries) {
    if (selectedIds.has(entry.id))
      count++
  }
  if (count === 0)
    return 'none'
  if (count === group.entries.length)
    return 'all'
  return 'some'
}

export function toggleGroup(group: VocabDayGroup, selectedIds: Set<string>): Set<string> {
  const next = new Set(selectedIds)
  const state = getGroupTriState(group, selectedIds)
  if (state === 'all') {
    for (const entry of group.entries)
      next.delete(entry.id)
  }
  else {
    for (const entry of group.entries)
      next.add(entry.id)
  }
  return next
}

export function toggleWord(id: string, selectedIds: Set<string>): Set<string> {
  const next = new Set(selectedIds)
  if (next.has(id))
    next.delete(id)
  else
    next.add(id)
  return next
}
