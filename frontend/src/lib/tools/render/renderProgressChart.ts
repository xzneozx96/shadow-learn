import { z } from 'zod'
import { executeRenderProgressChart } from '@/lib/agent-tools'
import { buildTool } from '@/lib/tools/types'

export const renderProgressChartTool = buildTool({
  name: 'render_progress_chart',
  description: 'Renders a visual chart of accuracy or mastery trends over time.',
  inputSchema: z.object({ metric: z.enum(['accuracy', 'mastery']) }),
  isConcurrencySafe: () => true,
  isReadOnly: () => true,
  execute: async (input, context) => executeRenderProgressChart(context.idb, input),
})
