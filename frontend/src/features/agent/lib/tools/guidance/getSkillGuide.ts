import { z } from 'zod'
import skillCharactersContent from '@/features/agent/lib/skills/skill_characters.md?raw'
import skillGrammarComplementsContent from '@/features/agent/lib/skills/skill_grammar_complements.md?raw'
import skillGrammarFoundationsContent from '@/features/agent/lib/skills/skill_grammar_foundations.md?raw'
import skillListeningContent from '@/features/agent/lib/skills/skill_listening.md?raw'
import skillPronunciationContent from '@/features/agent/lib/skills/skill_pronunciation.md?raw'
import skillSpeakingContent from '@/features/agent/lib/skills/skill_speaking.md?raw'
import skillTonesContent from '@/features/agent/lib/skills/skill_tones.md?raw'
import skillVocabularyContent from '@/features/agent/lib/skills/skill_vocabulary.md?raw'
import { buildTool } from '@/features/agent/lib/tools/types'

const SKILL_CONTENT_MAP: Record<string, string> = {
  tones: skillTonesContent,
  pronunciation: skillPronunciationContent,
  vocabulary: skillVocabularyContent,
  grammar_foundations: skillGrammarFoundationsContent,
  grammar_complements: skillGrammarComplementsContent,
  listening: skillListeningContent,
  speaking: skillSpeakingContent,
  characters: skillCharactersContent,
}

export async function executeGetSkillGuide(input: { skill: string }) {
  const content = SKILL_CONTENT_MAP[input.skill]
  if (!content)
    return { error: `Unknown skill: ${input.skill}` }
  return { content }
}

export const getSkillGuideTool = buildTool({
  name: 'get_skill_guide',
  description: 'Retrieve expert knowledge, tips, tricks, and teaching strategies for a specific skill. ALWAYS call this tool BEFORE answering questions on how to improve, asking for advice, or struggling with a skill area. Grammar is split into sub-skills: use grammar_foundations for word order, verb serialisation, aspect particles (了/着/过), negation, questions, and Vietnamese-interference patterns; use grammar_complements for directional complements (方向补语 — 来/去, 上来, 下来, 出来, 过来, 起来, etc.).',
  inputSchema: z.object({
    skill: z.enum(['tones', 'pronunciation', 'vocabulary', 'grammar_foundations', 'grammar_complements', 'listening', 'speaking', 'characters']).describe('The skill area to retrieve'),
  }),
  searchHint: 'skill guide coaching tones pronunciation grammar',
  isDeferred: () => true,
  execute: executeGetSkillGuide,
})
