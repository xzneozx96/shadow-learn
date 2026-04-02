import { executeRenderStudySession, ToolInputSchemas } from '@/lib/agent-tools'
import { buildTool } from '@/lib/tools/types'

// openrouterApiKey is bound at construction time via factory pattern
export function makeRenderStudySessionTool(openrouterApiKey: string) {
  return buildTool({
    name: 'render_study_session',
    description: 'Start an interactive study session with one or more exercise types applied to specified vocabulary items. Call this when the user wants to practice vocabulary — it handles all exercise types in sequence. itemIds must be id values from get_vocabulary results. For cloze exercises include storyCount (1–10, default 1); for translation or pronunciation exercises include sentencesPerWord (1–5, default 1). Examples: { itemIds: ["id1","id2"], exerciseTypes: ["writing"] } — basic writing drill; { itemIds: ["id1","id2"], exerciseTypes: ["cloze"], storyCount: 3 } — 3 fill-in-the-blank stories.',
    inputSchema: ToolInputSchemas.render_study_session,
    isConcurrencySafe: () => false,
    isReadOnly: () => false,
    maxResultSizeChars: Number.MAX_SAFE_INTEGER,
    searchHint: 'study session exercises quiz vocabulary practice',
    execute: async (input, context) =>
      executeRenderStudySession(context.idb, input, openrouterApiKey),
  })
}
