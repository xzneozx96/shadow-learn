import type { NextLineSuggestion } from '@/types'
import { Info, Sparkles } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useI18n } from '@/contexts/I18nContext'
import { cn } from '@/lib/utils'

export function IntelligencePanel({
  nextLineSuggestion,
  culturalTips,
  vocabTips,
  masteredVocab,
  targetVocab,
}: {
  nextLineSuggestion?: NextLineSuggestion | null
  culturalTips?: Array<{ type: string, phrase: string, explanation: string }>
  vocabTips?: Array<{ type: string, word: string, reason: string }>
  masteredVocab: Set<string>
  targetVocab: string[]
}) {
  const { t } = useI18n()

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="p-4 space-y-4 overflow-y-auto">
        {/* Target Vocabulary Checklist */}
        <div className="p-3 bg-cyan-500/5 rounded-xl border border-cyan-500/20">
          <div className="flex items-center gap-2 text-xs font-bold text-cyan-500 uppercase mb-3 tracking-wider">
            <Sparkles size={12} />
            {t('speak.feedbackPanel.targetVocabulary')}
          </div>
          <div className="flex flex-wrap gap-2">
            {targetVocab.map((word) => {
              const isMastered = masteredVocab.has(word)
              return (
                <div
                  key={word}
                  className={cn(
                    'px-2.5 py-1 rounded-lg text-xs font-medium transition-all duration-300 bg-cyan-500/10 border border-cyan-500/30 text-cyan-200',
                    isMastered && 'line-through opacity-30',
                  )}
                >
                  {word}
                </div>
              )
            })}
          </div>
        </div>

        {/* Next line suggestion */}
        <AnimatePresence mode="wait">
          {nextLineSuggestion
            ? (
                <motion.div
                  key={nextLineSuggestion.suggestion}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                  className="p-4 bg-emerald-500/5 border border-emerald-500/20 rounded-xl shadow-sm space-y-3"
                >
                  <div className="flex items-center gap-2 text-xs font-bold text-emerald-500 uppercase tracking-wider">
                    <Sparkles size={14} />
                    {t('speak.feedbackPanel.nextLineSuggestion')}
                  </div>

                  <div className="space-y-1.5">
                    <div className="text-base font-bold text-foreground leading-relaxed">
                      {nextLineSuggestion.suggestion}
                    </div>
                    {nextLineSuggestion.romanization && (
                      <div className="text-sm text-emerald-500/90 font-medium leading-relaxed">
                        {nextLineSuggestion.romanization}
                      </div>
                    )}
                    <div className="text-sm text-emerald-100/70 italic leading-relaxed">
                      {nextLineSuggestion.translation}
                    </div>
                  </div>

                  {vocabTips && vocabTips.length > 0 && (() => {
                    const tip = vocabTips.at(-1)
                    if (!tip)
                      return null
                    return (
                      <div className="pt-3 border-t border-emerald-500/20 space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-white">{tip.word}</span>
                        </div>
                        <p className="text-xs text-emerald-100/70 leading-relaxed italic">{tip.reason}</p>
                      </div>
                    )
                  })()}
                </motion.div>
              )
            : vocabTips && vocabTips.length > 0 && vocabTips.at(-1)
              ? (
                  <motion.div
                    key="vocab-tip"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                    className="p-4 bg-emerald-500/5 border border-emerald-500/10 rounded-xl shadow-sm space-y-2"
                  >
                    <div className="flex items-center gap-2 text-xs font-bold text-emerald-500 uppercase tracking-wider">
                      <Sparkles size={14} />
                      {t('speak.feedbackPanel.tryThisWord')}
                    </div>
                    <p className="text-sm font-bold text-emerald-400">{vocabTips.at(-1)!.word}</p>
                    <p className="text-xs text-emerald-100/70 font-medium leading-relaxed">{vocabTips.at(-1)!.reason}</p>
                  </motion.div>
                )
              : null}
        </AnimatePresence>

        {/* Cultural Tips */}
        <AnimatePresence>
          {culturalTips && culturalTips.length > 0 && (
            <motion.div
              key={culturalTips[0].phrase}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl space-y-2"
            >
              <div className="flex items-center gap-2 text-xs font-bold text-blue-400 uppercase tracking-wider">
                <Info size={14} />
                {t('speak.feedbackPanel.culturalInsight')}
              </div>
              <p className="text-base text-foreground font-semibold leading-snug">{culturalTips[0].phrase}</p>
              <p className="text-sm text-blue-200/70 leading-relaxed">{culturalTips[0].explanation}</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
