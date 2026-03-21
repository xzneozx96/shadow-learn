import { Loader2, Pause, Play, Volume2 } from 'lucide-react'
import { ExerciseCard } from '@/components/study/exercises/ExerciseCard'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/contexts/AuthContext'
import { useI18n } from '@/contexts/I18nContext'
import { useAudioRecorder } from '@/hooks/useAudioRecorder'
import { usePronunciationAssessment } from '@/hooks/usePronunciationAssessment'
import { useTTS } from '@/hooks/useTTS'
import { cn } from '@/lib/utils'

interface PronunciationSentence { sentence: string, translation: string }

interface Props {
  sentence: PronunciationSentence
  progress?: string
  onNext: (score: number, opts?: { skipped?: boolean }) => void
}

function scoreColor(n: number) {
  if (n >= 80)
    return 'text-emerald-400'
  if (n >= 60)
    return 'text-amber-400'
  return 'text-destructive'
}

function barColor(n: number) {
  if (n >= 80)
    return 'bg-emerald-400'
  if (n >= 60)
    return 'bg-amber-400'
  return 'bg-destructive'
}

function useVerdict() {
  const { t } = useI18n()
  return (n: number) => {
    if (n >= 90)
      return t('study.pronunciation.excellent')
    if (n >= 75)
      return t('study.pronunciation.good')
    if (n >= 60)
      return t('study.pronunciation.fair')
    if (n >= 40)
      return t('study.pronunciation.keepPracticing')
    return t('study.pronunciation.needsWork')
  }
}

export function PronunciationReferee({ sentence, progress = '', onNext }: Props) {
  const { db, keys } = useAuth()
  const { t } = useI18n()
  const verdict = useVerdict()
  const { playTTS, loadingText } = useTTS(db, keys)
  const isTTSLoading = loadingText === sentence.sentence
  const {
    recordingState,
    blob,
    isPlaying,
    attempt,
    startRecording,
    stopRecording,
    togglePlayback,
    reset: audioReset,
  } = useAudioRecorder()
  const { submit, result, submitting, error, reset: assessmentReset } = usePronunciationAssessment()

  const isProcessing = recordingState === 'processing' || submitting
  const canSubmit = blob !== null && recordingState === 'stopped' && !submitting

  const footer = result
    ? null
    : (
        <div className="flex items-center justify-center gap-3 p-3">
          <Button variant="ghost" size="sm" onClick={() => onNext(0, { skipped: true })}>{t('study.skip')}</Button>
          <Button
            size="sm"
            disabled={!canSubmit}
            onClick={() => blob && void submit(blob, sentence.sentence)}
          >
            {isProcessing
              ? (
                  <>
                    <div className="size-3.5 rounded-full border-2 border-current border-t-transparent animate-spin" />
                    {' '}
                    {t('study.pronunciation.scoring')}
                  </>
                )
              : t('study.pronunciation.submitButton')}
          </Button>
        </div>
      )

  return (
    <ExerciseCard
      type={t('study.mode.pronunciation')}
      progress={progress}
      footer={footer}
      info={t('study.exercise.pronunciation.info')}
    >
      {/* Sentence display */}
      <div className="relative rounded-lg border border-border bg-muted/20 p-4 text-center mb-4">
        <div className="text-xl font-bold tracking-widest text-foreground">
          {sentence.sentence}
        </div>
        <div className="text-sm text-muted-foreground mt-1.5">{sentence.translation}</div>
        {result && (
          <button
            aria-label="Play reference audio"
            onClick={() => void playTTS(sentence.sentence)}
            disabled={isTTSLoading}
            className="absolute top-2 right-2 p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors disabled:opacity-50"
          >
            {isTTSLoading
              ? <Loader2 className="size-4 animate-spin" />
              : <Volume2 className="size-4" />}
          </button>
        )}
      </div>

      {/* Recording controls (hidden once scored) */}
      {!result && (
        <>
          <div className="flex gap-2 mb-2">
            <Button
              variant="destructive"
              className={cn(
                'flex-1',
                recordingState === 'recording' && 'shadow-[0_0_0_3px_oklch(0.65_0.18_25/0.2)]',
              )}
              onClick={recordingState === 'recording' ? stopRecording : () => void startRecording()}
            >
              {recordingState === 'recording' ? t('study.stopRecord') : t('study.startRecord')}
            </Button>
            <Button
              variant="outline"
              disabled={!blob}
              onClick={togglePlayback}
            >
              {isPlaying ? <Pause className="size-4" /> : <Play className="size-4" />}
              {isPlaying ? t('study.pause') : t('study.pronunciation.playbackLabel')}
            </Button>
          </div>
          {attempt > 0 && (
            <p className="text-sm text-muted-foreground/50 text-center mb-2">
              {t('study.pronunciation.attempt')}
              {' '}
              {attempt}
              {' '}
              {t('study.pronunciation.rerecordNote')}
            </p>
          )}
        </>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive mb-3">
          {error}
        </div>
      )}

      {/* Score results */}
      {result && (
        <div className="space-y-2">
          <div className="rounded-xl border border-border/50 bg-muted/20 overflow-hidden">
            <div className="flex items-center justify-between px-4 pt-3 pb-2.5">
              <div>
                <div className={cn('text-3xl font-bold tabular-nums tracking-tight leading-none', scoreColor(result.overall.accuracy))}>
                  {Math.round(result.overall.accuracy)}
                </div>
                <div className="mt-1 text-[10px] uppercase tracking-widest text-muted-foreground">
                  Accuracy
                </div>
              </div>
              <div className={cn('text-sm font-semibold', scoreColor(result.overall.accuracy))}>
                {verdict(result.overall.accuracy)}
              </div>
            </div>
            <div className="grid grid-cols-3 border-t border-border/40">
              {(['fluency', 'completeness', 'prosody'] as const).map((k, i) => (
                <div key={k} className={cn('px-3 py-2 text-center', i < 2 && 'border-r border-border/40')}>
                  <div className={cn('text-base font-bold tabular-nums', scoreColor(result.overall[k]))}>
                    {Math.round(result.overall[k])}
                  </div>
                  <div className="text-[9px] uppercase tracking-wider text-muted-foreground">{k}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            {result.words.map((w, i) => (
              <div
                // eslint-disable-next-line react/no-array-index-key
                key={`${w.word}-${i}`}
                className="flex items-center gap-2.5 rounded-lg border border-border/30 bg-muted/20 px-3 py-2"
              >
                <span className={cn('w-10 shrink-0 text-base font-bold', scoreColor(w.accuracy))}>
                  {w.word}
                </span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-border/60">
                  <div
                    className={cn('h-full rounded-full transition-all duration-700 ease-out', barColor(w.accuracy))}
                    style={{ width: `${w.accuracy}%` }}
                  />
                </div>
                <span className={cn('w-7 shrink-0 text-right text-sm font-bold tabular-nums', scoreColor(w.accuracy))}>
                  {Math.round(w.accuracy)}
                </span>
                {w.error_type && (
                  <span className={cn(
                    'shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] font-medium',
                    w.error_type === 'Mispronunciation' && 'border-amber-500/30 bg-amber-500/10 text-amber-400',
                    w.error_type === 'Omission' && 'border-destructive/30 bg-destructive/10 text-destructive',
                    w.error_type === 'Insertion' && 'border-blue-500/30 bg-blue-500/10 text-blue-400',
                  )}
                  >
                    {w.error_type === 'Mispronunciation' ? 'Mispron.' : w.error_type}
                  </span>
                )}
              </div>
            ))}
          </div>

          <div className="flex gap-2 pt-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => {
                assessmentReset()
                audioReset()
              }}
            >
              {t('study.pronunciation.tryAgain')}
            </Button>
            <Button
              className="flex-1"
              onClick={() => onNext(Math.round(result.overall.accuracy))}
            >
              {t('study.pronunciation.nextButton')}
            </Button>
          </div>
        </div>
      )}
    </ExerciseCard>
  )
}
