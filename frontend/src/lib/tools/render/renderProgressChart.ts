import type { ShadowLearnDB } from '@/db'
import { z } from 'zod'
import { getProgressStats } from '@/db'
import { buildTool } from '@/lib/tools/types'

export async function executeRenderProgressChart(
  db: ShadowLearnDB,
  args: { metric: 'accuracy' | 'mastery' },
) {
  const stats = await getProgressStats(db)

  if (args.metric === 'accuracy') {
    return {
      metric: 'accuracy',
      data: stats?.accuracyTrend ?? [],
    }
  }

  return {
    metric: 'mastery',
    data: stats?.skillProgress ?? null,
  }
}

export const renderProgressChartTool = buildTool({
  name: 'render_progress_chart',
  description: 'Render an inline progress chart in the chat. Use metric \'accuracy\' for a time-series chart of exercise accuracy over recent sessions; use \'mastery\' for a bar chart showing current mastery level per skill area. Do not call get_progress_summary first — this tool fetches its own data. Returns a rendered chart component.',
  inputSchema: z.object({ metric: z.enum(['accuracy', 'mastery']) }),
  isConcurrencySafe: () => true,
  isReadOnly: () => true,
  isDeferred: () => true,
  maxResultSizeChars: Number.MAX_SAFE_INTEGER,
  execute: async (input, context) => executeRenderProgressChart(context.idb, input),
})
