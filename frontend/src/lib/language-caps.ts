export type RomanizationSystem = 'pinyin' | 'ipa' | 'romaji' | 'none'
export type InputMode = 'ime-chinese' | 'standard'

export interface LanguageCapabilities {
  romanizationSystem: RomanizationSystem
  romanizationLabel: string // shown in exercise title: "Pinyin Recall", "IPA Recall"
  romanizationPlaceholder: string // input hint in RomanizationRecallExercise
  hasCharacterWriting: boolean // show/hide CharacterWritingExercise
  hasTranslation: boolean // gated off when source language IS the UI language (translating to itself is meaningless)
  inputMode: InputMode // drives LanguageInput: ChineseInput vs plain Input
  dictationPlaceholder: string // placeholder in DictationExercise + ShadowingDictationPhase
  languageName: string // "Chinese", "English" — informational
  /**
   * BCP-47 locale to send to Azure Speech pronunciation assessment.
   * null = language not supported by Azure pronunciation assessment.
   * Confirmed supported: zh-CN, en-US. Others are not supported.
   */
  azurePronunciationLocale: string | null
}

const LANGUAGE_CAPS: Record<string, LanguageCapabilities> = {
  'zh-CN': {
    romanizationSystem: 'pinyin',
    romanizationLabel: 'Pinyin',
    romanizationPlaceholder: 'e.g. nǐ hǎo or ni3 hao3',
    hasCharacterWriting: true,
    hasTranslation: true,
    inputMode: 'ime-chinese',
    dictationPlaceholder: '输入汉字…',
    languageName: 'Chinese',
    azurePronunciationLocale: 'zh-CN',
  },
  'zh-TW': {
    romanizationSystem: 'pinyin',
    romanizationLabel: 'Pinyin',
    romanizationPlaceholder: 'e.g. nǐ hǎo or ni3 hao3',
    hasCharacterWriting: true,
    hasTranslation: true,
    inputMode: 'ime-chinese',
    dictationPlaceholder: '輸入漢字…',
    languageName: 'Chinese (Traditional)',
    azurePronunciationLocale: null, // zh-TW not confirmed supported
  },
  'en': {
    romanizationSystem: 'none',
    romanizationLabel: '',
    romanizationPlaceholder: '',
    hasCharacterWriting: false,
    hasTranslation: true,
    inputMode: 'standard',
    dictationPlaceholder: 'Type what you heard…',
    languageName: 'English',
    azurePronunciationLocale: 'en-US',
  },
  'ja': {
    romanizationSystem: 'none',
    romanizationLabel: '',
    romanizationPlaceholder: '',
    hasCharacterWriting: true,
    hasTranslation: true,
    inputMode: 'standard',
    dictationPlaceholder: 'テキストを入力…',
    languageName: 'Japanese',
    azurePronunciationLocale: 'ja-JP',
  },
  'ko': {
    romanizationSystem: 'none',
    romanizationLabel: '',
    romanizationPlaceholder: '',
    hasCharacterWriting: false,
    hasTranslation: true,
    inputMode: 'standard',
    dictationPlaceholder: 'Type what you heard…',
    languageName: 'Korean',
    azurePronunciationLocale: null, // ko-KR not confirmed supported
  },
  'vi': {
    romanizationSystem: 'none',
    romanizationLabel: '',
    romanizationPlaceholder: '',
    hasCharacterWriting: false,
    hasTranslation: true,
    inputMode: 'standard',
    dictationPlaceholder: 'Type what you heard…',
    languageName: 'Vietnamese',
    azurePronunciationLocale: null, // vi-VN not confirmed supported
  },
}

export function getLanguageCaps(sourceLanguage?: string): LanguageCapabilities {
  if (!sourceLanguage)
    return LANGUAGE_CAPS['zh-CN']
  return (
    LANGUAGE_CAPS[sourceLanguage]
    ?? LANGUAGE_CAPS[sourceLanguage.split('-')[0]]
    ?? LANGUAGE_CAPS['zh-CN']
  )
}
