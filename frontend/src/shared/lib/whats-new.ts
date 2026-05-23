import { useSyncExternalStore } from 'react'
import { getLatestAnnouncementId } from './changelog'

const STORAGE_KEY = 'shadowlearn:whats-new:last-seen'
const SEEN_EVENT = 'whats-new-seen'

export function getLastSeenId(): string | null {
  return localStorage.getItem(STORAGE_KEY)
}

export function markAnnouncementSeen(id: string): void {
  localStorage.setItem(STORAGE_KEY, id)
  window.dispatchEvent(new Event(SEEN_EVENT))
}

export function hasUnseenAnnouncement(latestId: string | undefined): boolean {
  if (!latestId)
    return false
  return getLastSeenId() !== latestId
}

function subscribe(callback: () => void): () => void {
  window.addEventListener('storage', callback)
  window.addEventListener(SEEN_EVENT, callback)
  return () => {
    window.removeEventListener('storage', callback)
    window.removeEventListener(SEEN_EVENT, callback)
  }
}

export function useHasUnseenAnnouncement(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => hasUnseenAnnouncement(getLatestAnnouncementId()),
  )
}
