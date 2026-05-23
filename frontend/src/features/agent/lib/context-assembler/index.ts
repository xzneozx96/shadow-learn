import type { SurfaceContext } from './types'
import { buildGlobalPrompt, buildLessonPrompt, buildTipPrompt } from './blocks'

export { resolveThreadId } from './thread-key'
export type {
  GlobalContext,
  LessonAppState,
  LessonContext,
  Surface,
  SurfaceContext,
  TipContext,
} from './types'

export function buildPrompt(ctx: SurfaceContext): string {
  switch (ctx.surface) {
    case 'lesson': return buildLessonPrompt(ctx)
    case 'global': return buildGlobalPrompt(ctx)
    case 'tip': return buildTipPrompt(ctx)
  }
}
