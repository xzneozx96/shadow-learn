import type { ManifestStore } from './exportStores'

export type StoreGroup = 'words' | 'lessons' | 'progress' | 'chats' | 'settings' | 'media'

export const STORE_GROUPS: Record<ManifestStore, StoreGroup> = {
  'lessons': 'lessons',
  'segments': 'lessons',
  'user-materials': 'lessons',
  'tip-notes': 'lessons',
  'vocabulary': 'words',
  'word-stories': 'words',
  'learner-profile': 'progress',
  'progress-db': 'progress',
  'mastery-db': 'progress',
  'spaced-repetition': 'progress',
  'session-logs': 'progress',
  'mistakes-db': 'progress',
  'exercise-stats': 'progress',
  'daily-tasks': 'progress',
  'speak-sessions': 'progress',
  'shadowing-bests': 'progress',
  'tip-progress': 'progress',
  'tip-card-states': 'progress',
  'threads': 'chats',
  'thread-summaries': 'chats',
  'agent-memory': 'chats',
  'settings': 'settings',
}
