export type RomanizationSystem = 'pinyin' | 'ipa' | 'romaji' | 'none'
export type InputMode = 'ime-chinese' | 'standard'

export interface LanguageCapabilities {
  romanizationSystem: RomanizationSystem
  romanizationLabel: string // shown in exercise title: "Pinyin Recall", "IPA Recall"
  romanizationPlaceholder: string // input hint in RomanizationRecallExercise
  hasCharacterWriting: boolean // show/hide CharacterWritingExercise
  inputMode: InputMode // drives LanguageInput: ChineseInput vs plain Input
  dictationPlaceholder: string // placeholder in DictationExercise + ShadowingDictationPhase
  languageName: string // "Chinese", "English" — informational
}

const LANGUAGE_CAPS: Record<string, LanguageCapabilities> = {
  'zh-CN': {
    romanizationSystem: 'pinyin',
    romanizationLabel: 'Pinyin',
    romanizationPlaceholder: 'e.g. nǐ hǎo or ni3 hao3',
    hasCharacterWriting: true,
    inputMode: 'ime-chinese',
    dictationPlaceholder: '输入汉字…',
    languageName: 'Chinese',
  },
  'zh-TW': {
    romanizationSystem: 'pinyin',
    romanizationLabel: 'Pinyin',
    romanizationPlaceholder: 'e.g. nǐ hǎo or ni3 hao3',
    hasCharacterWriting: true,
    inputMode: 'ime-chinese',
    dictationPlaceholder: '輸入漢字…',
    languageName: 'Chinese (Traditional)',
  },
  'en': {
    romanizationSystem: 'ipa',
    romanizationLabel: 'IPA',
    romanizationPlaceholder: 'e.g. /həˈloʊ/ or həˈloʊ',
    hasCharacterWriting: false,
    inputMode: 'standard',
    dictationPlaceholder: 'Type what you heard…',
    languageName: 'English',
  },
  'ja': {
    romanizationSystem: 'romaji',
    romanizationLabel: 'Romaji',
    romanizationPlaceholder: 'e.g. konnichiwa',
    hasCharacterWriting: true,
    inputMode: 'standard',
    dictationPlaceholder: 'テキストを入力…',
    languageName: 'Japanese',
  },
  'ko': {
    romanizationSystem: 'none',
    romanizationLabel: '',
    romanizationPlaceholder: '',
    hasCharacterWriting: false,
    inputMode: 'standard',
    dictationPlaceholder: 'Type what you heard…',
    languageName: 'Korean',
  },
  'vi': {
    romanizationSystem: 'none',
    romanizationLabel: '',
    romanizationPlaceholder: '',
    hasCharacterWriting: false,
    inputMode: 'standard',
    dictationPlaceholder: 'Type what you heard…',
    languageName: 'Vietnamese',
  },
}

export function getLanguageCaps(sourceLanguage?: string): LanguageCapabilities {
  if (!sourceLanguage) return LANGUAGE_CAPS['zh-CN']
  return (
    LANGUAGE_CAPS[sourceLanguage]
    ?? LANGUAGE_CAPS[sourceLanguage.split('-')[0]]
    ?? LANGUAGE_CAPS['zh-CN']
  )
}
