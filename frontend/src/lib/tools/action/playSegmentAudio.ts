import { z } from 'zod'
import { buildTool } from '@/lib/tools/types'

export const playSegmentAudioTool = buildTool({
  name: 'play_segment_audio',
  description: 'Plays the TTS audio for a specific lesson segment.',
  inputSchema: z.object({ segmentId: z.string().optional() }),
  execute: async (input, context) => {
    context.agentActions.dispatch({ type: 'play_segment_audio', payload: input })
    return { ok: true }
  },
})
