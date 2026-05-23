import { ArrowUpRight, Plus } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useI18n } from '@/contexts/I18nContext'

export function FirstLessonCTA() {
  const { t } = useI18n()
  return (
    <Link to="/create" className="group block h-full">
      <article className="relative h-full min-h-[340px] overflow-hidden rounded-2xl border border-dashed border-primary/30 bg-primary/3 backdrop-blur-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] flex flex-col items-center justify-center text-center">
        <div className="pointer-events-none absolute -top-16 left-1/2 size-56 -translate-x-1/2 rounded-full bg-primary/8 blur-3xl" />
        <div className="relative mb-3 flex size-12 items-center justify-center rounded-xl border border-primary/40 bg-primary/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
          <Plus className="size-5 text-primary" />
        </div>
        <h2 className="relative text-lg font-bold tracking-tight text-foreground">
          {t('library.firstLesson.title')}
        </h2>
        <p className="relative mt-1 max-w-sm text-sm text-muted-foreground leading-relaxed">
          {t('library.firstLesson.subtitle')}
        </p>
        <span className="relative mt-5 inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-transform duration-200 group-hover:scale-[1.02]">
          {t('create.title')}
          <ArrowUpRight className="size-4" />
        </span>
      </article>
    </Link>
  )
}
