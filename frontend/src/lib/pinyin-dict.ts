import dict from '@/lib/pinyin-dict.json'

const pinyinDict: Record<string, string[]> = dict

export function getCandidates(syllable: string): string[] {
  if (!syllable)
    return []
  return pinyinDict[syllable.toLowerCase()] ?? []
}
