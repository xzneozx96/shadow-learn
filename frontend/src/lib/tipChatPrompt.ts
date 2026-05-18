export type ChatUiLanguage = 'en' | 'vi'

export interface BuildTipPromptInput {
  lessonTitle: string
  transcript: string
  uiLanguage: ChatUiLanguage
}

const LANGUAGE_INSTRUCTION: Record<ChatUiLanguage, string> = {
  en: 'Respond in English.',
  vi: 'Respond in Vietnamese.',
}

export function buildTipSystemPrompt(input: BuildTipPromptInput): string {
  return [
    'You are a Chinese-language tutor watching a YouTube tip video alongside the learner.',
    'Posture: give hints, not direct answers. When the learner asks something the transcript answers, prompt them to spot it first, then confirm.',
    'When relevant, cite the moment in the video using the timestamp format [MM:SS] so the UI can deep-link to it.',
    'Keep responses focused, plain-text, and short by default. The learner will ask for more depth if they want it.',
    LANGUAGE_INSTRUCTION[input.uiLanguage],
    '',
    `LESSON TITLE: ${input.lessonTitle}`,
    '',
    'TRANSCRIPT:',
    input.transcript,
  ].join('\n')
}
