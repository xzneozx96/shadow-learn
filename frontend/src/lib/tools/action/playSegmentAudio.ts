import { z } from 'zod'
import { buildTool } from '@/lib/tools/types'

export const playSegmentAudioTool = buildTool({
  name: 'play_segment_audio',
  description: 'Seek the video to a specific segment, play it, and auto-pause when the segment ends. Use navigate_to_segment instead if the user wants to continue watching past that point. segmentIndex is zero-based.',
  inputSchema: z.object({ segmentIndex: z.number().describe('Zero-based segment index to play') }),
  execute: async (input, context) => {
    context.agentActions.dispatch({ type: 'play_segment_audio', payload: input })
    return { ok: true }
  },
})
