import { z } from 'zod'
import { buildTool } from '@/lib/tools/types'

export const navigateToSegmentTool = buildTool({
  name: 'navigate_to_segment',
  description: 'Seek the video player to a specific segment and start playing from that point. segmentIndex is zero-based and must come from the lesson\'s segment list. Use play_segment_audio instead if the user only wants to hear a single segment and then stop.',
  inputSchema: z.object({ segmentIndex: z.number().describe('Zero-based segment index to seek to') }),
  execute: async (input, context) => {
    context.agentActions.dispatch({ type: 'navigate_to_segment', payload: input })
    return { ok: true }
  },
})
