import { executeRenderStudySession, ToolInputSchemas } from '@/lib/agent-tools'
import { buildTool } from '@/lib/tools/types'

// openrouterApiKey is bound at construction time via factory pattern
export function makeRenderStudySessionTool(openrouterApiKey: string) {
  return buildTool({
    name: 'render_study_session',
    description: 'Generates an interactive study session with vocabulary exercises. ALWAYS use this tool to render exercises — never write exercise content as plain text. Supports: writing, dictation, translation, pronunciation, cloze, reconstruction, romanization-recall.',
    inputSchema: ToolInputSchemas.render_study_session,
    isConcurrencySafe: () => false,
    isReadOnly: () => false,
    maxResultSizeChars: 10000,
    searchHint: 'study session exercises quiz vocabulary practice',
    execute: async (input, context) =>
      executeRenderStudySession(context.idb, input, openrouterApiKey),
  })
}
