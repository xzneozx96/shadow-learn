import { createContext, use, useState } from 'react'

type Skill = 'vocabulary' | 'listening' | 'speaking' | 'reading' | 'writing'

interface DailyReviewContextValue {
  isOpen: boolean
  initialSkill: Skill | null
  openReviewModal: (skill?: Skill | null) => void
  closeReviewModal: () => void
}

const DailyReviewContext = createContext<DailyReviewContextValue | null>(null)

export function DailyReviewProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)
  const [initialSkill, setInitialSkill] = useState<Skill | null>(null)

  function openReviewModal(skill?: Skill | null) {
    setInitialSkill(skill ?? null)
    setIsOpen(true)
  }

  return (
    <DailyReviewContext value={{ isOpen, initialSkill, openReviewModal, closeReviewModal: () => setIsOpen(false) }}>
      {children}
    </DailyReviewContext>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useDailyReview() {
  const ctx = use(DailyReviewContext)
  if (!ctx)
    throw new Error('useDailyReview must be used within DailyReviewProvider')
  return ctx
}
