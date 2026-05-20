import type { Surface } from './types'

export function resolveThreadId(
  surface: Surface,
  owner: { lessonId?: string, courseId?: string, videoId?: string },
): string {
  if (surface === 'lesson') {
    if (!owner.lessonId)
      throw new Error('resolveThreadId: lessonId required for lesson surface')
    return owner.lessonId
  }
  if (surface === 'global')
    return '__global'
  if (!owner.courseId || !owner.videoId)
    throw new Error('resolveThreadId: courseId+videoId required for tip surface')
  return `${owner.courseId}:${owner.videoId}`
}
